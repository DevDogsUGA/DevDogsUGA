/// <reference path="../cloudflare-env.d.ts" />
/**
 * Registrar scrape, as a Cloudflare Workflow instead of one long HTTP
 * request (see the former src/app/(api)/cron/scrape-registrar/route.ts,
 * which this supersedes as the cron target). The native schedule is declared
 * on the Workflow binding in wrangler.jsonc.
 *
 * Splitting into one step per term means a single term's failure -- a
 * vanished CSV, a bad calendar lookup, a constraint violation -- can't burn
 * the CPU/wall-time budget of, or abort, every other term's reconcile the
 * way the single-request version could. Each `step.do` call is also
 * separately retried and checkpointed by the Workflows engine, so a crash
 * mid-run resumes from the last completed step instead of restarting the
 * whole scrape.
 *
 * A Workflow step runs with no OpenNext request context to key a cached
 * Drizzle client on (unlike `~/server/db`'s `db` proxy, which keys one to
 * the current request via `getCloudflareContext()`). Every step that talks
 * to Postgres therefore builds its own client from
 * the deployed Hyperdrive binding (or local `DB_URL`) via
 * `createScheduleBuilderDb`
 * *inside* the step callback, never cached on `this` -- a step may resume in
 * a brand-new isolate after the Workflow sleeps, crashes, or is rescheduled,
 * and a live Postgres connection can't survive that gap.
 */
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import * as Sentry from "@sentry/cloudflare";
import { buildSentryOptions } from "@devdogsuga/telemetry";
import {
  detectAvailableTerms,
  fetchPartsOfTerm,
  academicPeriodInfo,
  CalendarNotFoundError,
} from "~/lib/parsers";
import {
  fetchSemesterCsv,
  type FailedFetch,
} from "~/lib/parsers/AvailableTerms";
import {
  reconcileTerm,
  type TermReconcileResult,
} from "~/lib/parsers/reconcileTerm";
import type { ResolvedTerm } from "~/lib/parsers/termPartsOfTerm";
// Import the env-free leaf, not `~/server/db`: this module is evaluated during
// Cloudflare's Worker startup validation, before Next's build-time replacement
// of required `NEXT_PUBLIC_*` values. The request-scoped barrel imports
// `~/env`, while this factory only needs an explicit connection string.
import { createScheduleBuilderDb } from "~/server/db/create";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { resolveWorkflowDatabaseUrl } from "./database-url";

/**
 * Opaque -- scheduled and manual instances need no per-instance parameters.
 */
export type ScrapeWorkflowParams = Record<string, never>;

/**
 * The bindings Sentry instrumentation reads out of the Workflow's `env`.
 * Hand-rolled, structural, and deliberately not imported from `~/env` -- same
 * reasoning as `WorkflowDatabaseEnv` in `./database-url.ts`: this module
 * evaluates during Worker startup validation, before the request-scoped `env`
 * barrel is safe to import. `SENTRY_DSN` is a Worker secret, invisible to
 * `wrangler types`' generated `CloudflareEnv`, so `CloudflareEnv` is passed
 * here structurally rather than cast.
 */
interface WorkflowSentryEnv {
  readonly SENTRY_DSN?: string;
  readonly DEPLOY_ENV?: string;
}

/**
 * Sentry Crons monitor slug for the daily registrar scrape, and the native
 * Workflow schedule it upserts against -- kept in step with wrangler.jsonc's
 * production `workflows[].schedules` and the audit metadata in
 * `./scheduled.ts`'s `WORKFLOW_CRONS`. Only the production environment has
 * this schedule wired; staging/development instances are triggered by hand
 * (see wrangler.jsonc), so their check-ins upsert the same monitor config
 * without a missed-run alert ever firing there -- Sentry Crons issues are
 * scoped by monitor *and* environment tag, and alert rules are
 * production-only by the workspace's settled design.
 */
const SCRAPE_MONITOR_SLUG = "schedule-builder-scrape";
const SCRAPE_SCHEDULE = "5 14 * * *";

/**
 * `run()`'s return value, and every intermediate `step.do` return value, is
 * persisted by the Workflows engine and replayed on resume -- it must be
 * `Rpc.Serializable` (plain data only: no class instances, no `Map`s, no
 * Drizzle rows). `TermReconcileResult` is already documented as such; this
 * shape adds nothing that isn't.
 */
export type ScrapeWorkflowResult = {
  termResults: TermReconcileResult[];
  failedFetches: FailedFetch[];
  failures: { academicPeriod: number; error: string }[];
};

/**
 * Undecorated class. Exported (below) only after
 * `Sentry.instrumentWorkflowWithSentry` wraps it -- see the cheatsheet's
 * Cloudflare Workflows pattern. That wrapper substitutes `step` for a
 * Sentry-instrumented proxy before calling `run()`, so every `step.do` call
 * below already gets a span, and -- on its last retry attempt -- an automatic
 * `captureException` for free, with no per-attempt/per-retry event of its
 * own. This class therefore only adds what the wrapper does NOT give it:
 * breadcrumbs so a retry's history is visible on whatever event eventually
 * fires, and Sentry Crons check-ins plus a `captureException` for the two
 * failure paths that happen OUTSIDE any `step.do` call (zero terms detected;
 * the aggregate "completed partially" throw at the end) and so are invisible
 * to the wrapper's per-step capture.
 */
class ScrapeWorkflowBase extends WorkflowEntrypoint<
  CloudflareEnv,
  ScrapeWorkflowParams
> {
  async run(
    _event: Readonly<WorkflowEvent<ScrapeWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<ScrapeWorkflowResult> {
    // Manual two-phase check-in (not `withMonitor`, which wraps a single
    // callback): this run spans multiple `step.do` calls and can hibernate
    // between them, so "in progress" has to be reported before any of that
    // happens and "ok"/"error" only once the whole thing has settled.
    // `checkinMargin`/`maxRuntime` are generous, not the five/ten-minute
    // platform crons' tight ones: a full scrape fans out over every open
    // term and can run for several minutes.
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: SCRAPE_MONITOR_SLUG, status: "in_progress" },
      {
        schedule: { type: "crontab", value: SCRAPE_SCHEDULE },
        checkinMargin: 30,
        maxRuntime: 60,
      },
    );

    try {
      // Only the academic period + description survive to the next step --
      // NOT the parsed `.rows`. Step output is persisted/replayed by the
      // Workflows engine, and a whole semester's CSV is unbounded; each
      // term's own step re-fetches its CSV from scratch instead.
      const detection = await step.do("detect-available-terms", async (ctx) => {
        console.log(
          `[scrape-workflow] detect-available-terms attempt ${ctx.attempt}`,
        );
        Sentry.addBreadcrumb({
          category: "workflow-step",
          message: `detect-available-terms attempt ${ctx.attempt}`,
          level: "info",
        });
        const { terms, failedFetches } = await detectAvailableTerms();
        if (failedFetches.length > 0) {
          console.error("[scrape-workflow] CSV fetch failures:", failedFetches);
        }
        return {
          terms: terms.map(({ academicPeriod, description }) => ({
            academicPeriod,
            description,
          })),
          failedFetches,
        };
      });

      if (detection.terms.length === 0) {
        throw new NonRetryableError(
          `No registrar terms were detected: ${JSON.stringify(detection.failedFetches)}`,
        );
      }

      const termResults: TermReconcileResult[] = [];
      const failures: { academicPeriod: number; error: string }[] = [];

      for (const { academicPeriod } of detection.terms) {
        // One term's failure must not abort the loop -- caught here rather
        // than left to reject `run()` and take every other term down with it.
        try {
          const result = await step.do(
            `reconcile-term-${academicPeriod}`,
            async (ctx) => {
              console.log(
                `[scrape-workflow] reconcile-term-${academicPeriod} attempt ${ctx.attempt}`,
              );
              Sentry.addBreadcrumb({
                category: "workflow-step",
                message: `reconcile-term-${academicPeriod} attempt ${ctx.attempt}`,
                level: "info",
              });
              const { semester } = academicPeriodInfo(academicPeriod);

              // Re-fetched here, not carried over from
              // "detect-available-terms" (see that step's comment for why).
              let csv: Awaited<ReturnType<typeof fetchSemesterCsv>>;
              let partOfTermRows: Awaited<ReturnType<typeof fetchPartsOfTerm>>;
              try {
                [csv, partOfTermRows] = await Promise.all([
                  fetchSemesterCsv(semester),
                  fetchPartsOfTerm(academicPeriod),
                ]);
              } catch (error) {
                // The registrar does not publish calendars indefinitely. A
                // missing year cannot heal on retry, so let the outer
                // per-term catch record it immediately instead of running
                // the same HTTP request through every default Workflow
                // retry.
                if (error instanceof CalendarNotFoundError) {
                  throw new NonRetryableError(error.message);
                }
                throw error;
              }

              // Deterministic, per-term failures: the registrar's CSV for
              // this semester is gone, or its parts-of-term calendar
              // resolved to zero rows. `NonRetryableError` tells the
              // Workflows engine not to retry -- retrying would just
              // re-fetch the same missing data.
              if (!csv) {
                throw new NonRetryableError(
                  `No CSV rows available for academic period ${academicPeriod}`,
                );
              }
              if (partOfTermRows.length === 0) {
                throw new NonRetryableError(
                  `No parts-of-term rows resolved for academic period ${academicPeriod}`,
                );
              }

              const term: ResolvedTerm = { ...csv, partOfTermRows };
              const db = createScheduleBuilderDb(
                resolveWorkflowDatabaseUrl(this.env),
              );
              return reconcileTerm(term, db);
            },
          );
          termResults.push(result);
        } catch (err) {
          failures.push({
            academicPeriod,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Partial writes are useful, but a partially refreshed catalog is not
      // a successful scrape. Mark the instance errored after every viable
      // term had its chance to reconcile so the dashboard/CLI cannot report
      // a false green.
      if (detection.failedFetches.length > 0 || failures.length > 0) {
        throw new NonRetryableError(
          `Registrar scrape completed partially: ${JSON.stringify({
            failedFetches: detection.failedFetches,
            failures,
            completedPeriods: termResults.map((r) => r.academicPeriod),
          })}`,
        );
      }

      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: SCRAPE_MONITOR_SLUG,
        status: "ok",
      });
      return {
        termResults,
        failedFetches: detection.failedFetches,
        failures,
      };
    } catch (err) {
      // Terminal only: this catches the two failure paths above that happen
      // OUTSIDE a `step.do` call (zero terms detected; the aggregate
      // "completed partially" throw), plus any truly unexpected bug in this
      // method's own control flow. A per-term step that exhausted its
      // retries was already captured once by the wrapper's per-step
      // instrumentation before landing in the per-term `catch` above; this
      // is a separate, aggregate signal for the run as a whole, not a
      // duplicate of that one.
      Sentry.captureException(err);
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: SCRAPE_MONITOR_SLUG,
        status: "error",
      });
      // `flush` is normally handled per-step by the wrapper, but this throw
      // happens outside any `step.do` call, so nothing else guarantees the
      // check-in/exception above reach Sentry before the Workflow's isolate
      // is torn down.
      await Sentry.flush(2000);
      throw err;
    }
  }
}

/**
 * Split out of the `instrumentWorkflowWithSentry` call below so its parameter
 * can be typed as `WorkflowSentryEnv` (structural, hand-rolled) rather than
 * `CloudflareEnv` (the generated, DSN-blind type). `instrumentWorkflowWithSentry`
 * infers its environment type parameter from BOTH arguments at once -- the
 * class's own constructor parameter fixes it at `CloudflareEnv` -- so
 * annotating the options callback's OWN parameter as `WorkflowSentryEnv`
 * would conflict with that inference instead of merely narrowing it. The
 * callback passed below stays typed `(env: CloudflareEnv) => ...` to satisfy
 * that inference, and calls this function as an ordinary function call
 * instead, which only needs the argument assignable to the parameter type --
 * true here since every field `WorkflowSentryEnv` declares is optional.
 */
function scrapeWorkflowSentryOptions(env: WorkflowSentryEnv) {
  return (
    buildSentryOptions({
      service: "schedule-builder",
      environment: env.DEPLOY_ENV ?? "development",
      dsn: env.SENTRY_DSN,
    }) ?? {}
  );
}

/**
 * The instrumented export. wrangler.jsonc's `workflows[].class_name:
 * "ScrapeWorkflow"` binding, and `cloudflare/worker.ts`'s re-export, both
 * name this export -- neither needs to change for the wrapping to apply.
 *
 * `scrapeWorkflowSentryOptions` returning `{}` when `buildSentryOptions`
 * returns `undefined` (no `SENTRY_DSN` configured), rather than skipping
 * `instrumentWorkflowWithSentry` altogether, still satisfies the no-DSN
 * no-op contract: `@sentry/core`'s `Client` constructor makes no transport
 * and does no network I/O when `options.dsn` is falsy (see
 * `packages/telemetry`'s README), and its one console line behind that path
 * is gated on `debug`, which is never set here.
 */
export const ScrapeWorkflow = Sentry.instrumentWorkflowWithSentry(
  (env: CloudflareEnv) => scrapeWorkflowSentryOptions(env),
  ScrapeWorkflowBase,
);
