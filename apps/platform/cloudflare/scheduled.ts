/**
 * Cloudflare cron dispatcher (replaces vercel.json crons). Composed into the
 * deployed worker by cloudflare/worker.ts, which composes vinext's
 * `app-router-entry` `fetch` handler and wires this `scheduled` handler;
 * wrangler `main` points at that entry and `triggers.crons` fires these
 * schedules.
 *
 * Each cron hits the existing CRON_SECRET-guarded route on the worker's own
 * public origin (`env.BASE_URL`), so no route logic changes. The schedules
 * mirror the former vercel.json entries.
 */
import * as Sentry from "@sentry/cloudflare";
import type { env } from "~/env";

/**
 * The bindings this handler reads, derived from the env schema rather than
 * restated.
 *
 * `Pick` and not a hand-written interface, because these are Worker *secrets*
 * and the deploy pipeline decides which secrets exist by reading the schema in
 * `~/env`. A second, independent list here would drift silently in the
 * dangerous direction: a secret declared only in this file is one the audit
 * would see on the Worker, fail to find in the schema, and report as orphaned,
 * meaning safe to delete from production.
 *
 * Type-only import, so nothing is pulled into the Worker bundle and @t3-oss
 * validation does not run in this entry point. Picking a key that leaves the
 * schema is a compile error; declaring one that was never in it is impossible.
 */
export type CronEnv = Pick<typeof env, "CRON_SECRET" | "BASE_URL">;

/**
 * Cron expression to the routes it fires and a one-line description of the
 * group's purpose.
 *
 * A list per expression, not a single route: Cloudflare fires each schedule
 * once, and more than one pass can want the same cadence. With a bare
 * `Record<string, string>` the second five-minute pass added would have
 * silently replaced the first: a whole subsystem quietly not running, with
 * nothing to notice it by.
 *
 * `label` carries the purpose in English so devtools `cron list` can print it
 * without reading source comments. The shape is enforced by devtools' zod
 * schema at its import boundary.
 *
 * `monitorSlug` and `monitor` are extra fields devtools' `CronEntry` schema
 * does not know about and does not need to: `z.object` ignores unmodelled
 * keys rather than rejecting them, so this stays a single source of truth for
 * "what fires on this schedule" AND "what Sentry Crons monitor covers it,"
 * without a second table that could drift from this one. `monitor` upserts
 * the Sentry monitor's schedule/margins on every check-in (see `scheduled()`
 * below) so the config lives next to the table instead of only in the Sentry
 * dashboard.
 */
export const CRON_ROUTES: Record<
  string,
  {
    routes: string[];
    label: string;
    monitorSlug: string;
    monitor: { checkinMargin: number; maxRuntime: number };
  }
> = {
  "0 0 * * *": {
    label: "Nightly repair: GitHub reconcile, catalog",
    monitorSlug: "platform-cron-nightly-repair",
    // Two sequential upstream passes, the second of which (academic-programs)
    // deliberately spaces ~42 requests -- generous margins rather than the
    // five/ten-minute crons' tight ones.
    monitor: { checkinMargin: 15, maxRuntime: 30 },
    routes: [
      // Repairs team membership a failed API call left wrong. Nightly rather
      // than more often on purpose: every membership change already fires on
      // the platform event that caused it, so if this pass is doing meaningful
      // work regularly then something upstream is broken and a tighter cadence
      // would hide it.
      "/cron/github-reconcile",
      // Mirrors the UGA Bulletin's program catalog for the account Academics
      // combobox. Last in the daily group because it deliberately spaces
      // roughly 42 upstream page requests; a slow or rate-limited Bulletin
      // must not delay the GitHub repair pass above.
      "/cron/academic-programs",
    ],
  },
  // Fifteen minutes is the WORST case now: `.github/workflows/deploy-app.yaml`
  // also calls this route directly, right after each platform deploy, so a
  // promoted config normally lands the moment that deploy finishes (see
  // `server/config/reconcile.ts`'s route for why that step runs post-deploy
  // rather than post-migrate). This slot stays as the fallback for a config
  // edit that lands with no accompanying deploy, and as the floor if the
  // deploy-time call itself fails partway.
  "*/15 * * * *": {
    label: "Config reconcile (meetings, workshops)",
    monitorSlug: "platform-cron-config-reconcile",
    monitor: { checkinMargin: 5, maxRuntime: 10 },
    routes: ["/cron/config-reconcile"],
  },
  "*/10 * * * *": {
    label: "Discord role sync",
    monitorSlug: "platform-cron-discord-role-sync",
    monitor: { checkinMargin: 5, maxRuntime: 10 },
    routes: ["/cron/sync-discord-roles"],
  },
};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const entry = CRON_ROUTES[event.cron];
  if (!entry) return;

  // `Sentry.withMonitor` no-ops (no init, no network call, no console spam)
  // when the outer `withSentry` wrapper in ./worker.ts skipped `Sentry.init`
  // for lack of a DSN -- `captureCheckIn` checks `getClient()` first and
  // returns quietly if there is none. The `monitor` config upserts the
  // schedule/margins on every check-in, so Sentry's copy of "when should
  // this have run" never drifts from the table above without a code change.
  await Sentry.withMonitor(
    entry.monitorSlug,
    () => dispatch(event.cron, entry.routes, env),
    {
      schedule: { type: "crontab", value: event.cron },
      checkinMargin: entry.monitor.checkinMargin,
      maxRuntime: entry.monitor.maxRuntime,
    },
  );
}

async function dispatch(
  cron: string,
  paths: string[],
  env: CronEnv,
): Promise<void> {
  // Sequential rather than concurrent: these passes share a connection pool,
  // and a five-minute cadence has no deadline that parallelism would help.
  // Continue after a failed route so one upstream outage cannot starve the
  // other jobs sharing its cron expression, then fail the invocation so Worker
  // observability still records the problem instead of reporting a false
  // success. Throwing here is also what tells `withMonitor` above to report
  // this check-in as "error" rather than "ok".
  const failures: string[] = [];
  for (const path of paths) {
    try {
      const response = await fetch(`${env.BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      if (!response.ok) failures.push(`${path}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("cron_dispatch_failed", { cron, failures });
    throw new Error(`Cron routes failed: ${failures.join("; ")}`);
  }
}
