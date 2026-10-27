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
import type { HeartbeatJob } from "~/server/heartbeats/jobs";

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
 *
 * Only one group has a monitor: Sentry bills a seat per monitor, and the plan
 * covers one. A group without one declares a `heartbeat` instead, recorded
 * when every route in it succeeds, and the monitored group's
 * `/cron/heartbeats` route fails while that record is overdue (see
 * `~/server/heartbeats/jobs`). Dropping a `monitorSlug` is enough to retire its
 * monitor: `backstage deploy prune-monitors` deletes undeclared ones.
 */
export const CRON_ROUTES: Record<
  string,
  {
    routes: string[];
    label: string;
    monitorSlug?: string;
    monitor?: { checkinMargin: number; maxRuntime: number };
    heartbeat?: HeartbeatJob;
  }
> = {
  // There is no daily group any more. The "0 0 * * *" group ran the GitHub
  // reconcile (deleted with Teams and competitions) and the UGA Bulletin
  // program sync (moved to the catalog Worker's ProgramsWorkflow, TASK-469,
  // which reports through the "catalog-academic-programs" heartbeat). A job
  // that needs a nightly slot adds the group, its cron trigger in
  // wrangler.jsonc, and a heartbeat row in a migration together.
  // Fifteen minutes is the WORST case now: `.github/workflows/deploy-app.yaml`
  // also calls this route directly, right after each platform deploy, so a
  // promoted config normally lands the moment that deploy finishes (see
  // `server/config/reconcile.ts`'s route for why that step runs post-deploy
  // rather than post-migrate). This slot stays as the fallback for a config
  // edit that lands with no accompanying deploy, and as the floor if the
  // deploy-time call itself fails partway.
  "*/15 * * * *": {
    label:
      "Config reconcile (meetings, workshops), support forum index, Discord role sync, moderation delivery re-queue, account deletions, daily job heartbeats",
    monitorSlug: "platform-cron-config-reconcile",
    // Role sync pages through every guild member, so the runtime ceiling is
    // looser than the config pass alone needs.
    monitor: { checkinMargin: 5, maxRuntime: 15 },
    routes: [
      "/cron/config-reconcile",
      // Indexes native #tech-support posts for the docs widget's
      // suggestions, keeps its Discord commands registered, and expires
      // guests. Second, so a slow Discord never delays a config promotion.
      "/cron/support",
      // Three-way merge of synced role membership between the platform and
      // Discord. After the passes above, so a slow guild member listing
      // delays none of them.
      "/cron/sync-discord-roles",
      // Queues any moderation delivery the queue never received or lost track
      // of, so a decision a moderator made reaches its app eventually. Cheap
      // when there is nothing to do.
      "/cron/moderation-deliveries",
      // Deletes accounts whose fourteen-day window has ended. Before the
      // heartbeats, after the delivery re-queue so the `user.delete` messages
      // it queues are not swept up in the same pass. A deletion that fails
      // stays pending and this slot retries it, and the route answers 500
      // while one is stuck, which errors this slot's monitor.
      "/cron/account-deletions",
      // Fails while a daily job is overdue, which errors this slot's
      // monitor: the daily jobs have none of their own. Last, and cheap.
      "/cron/heartbeats",
    ],
  },
};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const entry = CRON_ROUTES[event.cron];
  if (!entry) return;

  const run = () => dispatch(event.cron, entry, env);
  if (!entry.monitorSlug || !entry.monitor) {
    await run();
    return;
  }

  // `Sentry.withMonitor` no-ops (no init, no network call, no console spam)
  // when the outer `withSentry` wrapper in ./worker.ts skipped `Sentry.init`
  // for lack of a DSN -- `captureCheckIn` checks `getClient()` first and
  // returns quietly if there is none. The `monitor` config upserts the
  // schedule/margins on every check-in, so Sentry's copy of "when should
  // this have run" never drifts from the table above without a code change.
  await Sentry.withMonitor(entry.monitorSlug, run, {
    schedule: { type: "crontab", value: event.cron },
    checkinMargin: entry.monitor.checkinMargin,
    maxRuntime: entry.monitor.maxRuntime,
  });
}

async function dispatch(
  cron: string,
  entry: (typeof CRON_ROUTES)[string],
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
  async function call(
    label: string,
    path: string,
    init?: { method: string; headers: Record<string, string>; body: string },
  ) {
    try {
      const response = await fetch(`${env.BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET}`,
          ...init?.headers,
        },
      });
      if (!response.ok) failures.push(`${label}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const path of entry.routes) await call(path, path);

  // Only a group that fully succeeded counts as a run. A failed one is
  // reported below; one that keeps failing goes overdue as well.
  if (failures.length === 0 && entry.heartbeat) {
    await call(`heartbeat ${entry.heartbeat}`, "/cron/heartbeats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: entry.heartbeat }),
    });
  }

  if (failures.length > 0) {
    console.error("cron_dispatch_failed", { cron, failures });
    throw new Error(`Cron routes failed: ${failures.join("; ")}`);
  }
}
