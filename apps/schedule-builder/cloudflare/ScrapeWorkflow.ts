/// <reference path="../cloudflare-env.d.ts" />
/**
 * Registrar scrape, as a Cloudflare Workflow instead of one long HTTP
 * request (see the former src/app/(api)/cron/scrape-registrar/route.ts,
 * which this supersedes as the cron target -- cloudflare/scheduled.ts now
 * triggers this Workflow directly instead of fetching that route).
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
import { sql } from "drizzle-orm";
import {
  detectAvailableTerms,
  fetchPartsOfTerm,
  academicPeriodInfo,
  CalendarNotFoundError,
} from "~/lib/parsers";
import { fetchSemesterCsv } from "~/lib/parsers/AvailableTerms";
import {
  reconcileTerm,
  type TermReconcileResult,
} from "~/lib/parsers/reconcileTerm";
import type { ResolvedTerm } from "~/lib/parsers/termPartsOfTerm";
import { createScheduleBuilderDb } from "~/server/db";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { resolveWorkflowDatabaseUrl } from "./database-url";

/**
 * Opaque -- this Workflow is only ever triggered on a cron schedule (see
 * cloudflare/scheduled.ts's `env.SCRAPE_WORKFLOW.create()`), with no
 * per-instance parameters to carry.
 */
export type ScrapeWorkflowParams = Record<string, never>;

/**
 * `run()`'s return value, and every intermediate `step.do` return value, is
 * persisted by the Workflows engine and replayed on resume -- it must be
 * `Rpc.Serializable` (plain data only: no class instances, no `Map`s, no
 * Drizzle rows). `TermReconcileResult` is already documented as such; this
 * shape adds nothing that isn't.
 */
export type ScrapeWorkflowResult = {
  termResults: TermReconcileResult[];
  failures: { academicPeriod: number; error: string }[];
};

export class ScrapeWorkflow extends WorkflowEntrypoint<
  CloudflareEnv,
  ScrapeWorkflowParams
> {
  async run(
    _event: Readonly<WorkflowEvent<ScrapeWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<ScrapeWorkflowResult> {
    // Only the academic period + description survive to the next step --
    // NOT the parsed `.rows`. Step output is persisted/replayed by the
    // Workflows engine, and a whole semester's CSV is unbounded; each term's
    // own step re-fetches its CSV from scratch instead.
    const detected = await step.do("detect-available-terms", async () => {
      const { terms, failedFetches } = await detectAvailableTerms();
      if (failedFetches.length > 0) {
        console.error("[scrape-workflow] CSV fetch failures:", failedFetches);
      }
      return terms.map(({ academicPeriod, description }) => ({
        academicPeriod,
        description,
      }));
    });

    const termResults: TermReconcileResult[] = [];
    const failures: { academicPeriod: number; error: string }[] = [];

    for (const { academicPeriod } of detected) {
      // One term's failure must not abort the loop -- caught here rather
      // than left to reject `run()` and take every other term down with it.
      try {
        const result = await step.do(
          `reconcile-term-${academicPeriod}`,
          async () => {
            const { semester } = academicPeriodInfo(academicPeriod);

            // Re-fetched here, not carried over from "detect-available-terms"
            // (see that step's comment for why).
            let csv: Awaited<ReturnType<typeof fetchSemesterCsv>>;
            let partOfTermRows: Awaited<ReturnType<typeof fetchPartsOfTerm>>;
            try {
              [csv, partOfTermRows] = await Promise.all([
                fetchSemesterCsv(semester),
                fetchPartsOfTerm(academicPeriod),
              ]);
            } catch (error) {
              // The registrar does not publish calendars indefinitely. A
              // missing year cannot heal on retry, so let the outer per-term
              // catch record it immediately instead of running the same HTTP
              // request through every default Workflow retry.
              if (error instanceof CalendarNotFoundError) {
                throw new NonRetryableError(error.message);
              }
              throw error;
            }

            // Deterministic, per-term failures: the registrar's CSV for this
            // semester is gone, or its parts-of-term calendar resolved to
            // zero rows. `NonRetryableError` tells the Workflows engine not
            // to retry -- retrying would just re-fetch the same missing
            // data.
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

    // Ensure indexes and refresh the materialized search view after every
    // scrape, same as the route this Workflow replaced. Schema-qualified:
    // the postgres-js connection's default search_path ("$user", public)
    // does not include `schedule_builder`.
    await step.do("refresh-view", async () => {
      const db = createScheduleBuilderDb(resolveWorkflowDatabaseUrl(this.env));

      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "offeringSearch_crn_idx"
          ON "schedule_builder"."offeringSearch" (crn)
      `);

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "offeringSearch_fts_idx"
          ON "schedule_builder"."offeringSearch" USING gin (search_vector)
      `);

      await db.execute(
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY "schedule_builder"."offeringSearch"`,
      );
    });

    return { termResults, failures };
  }
}
