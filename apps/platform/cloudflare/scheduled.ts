/**
 * Cloudflare cron dispatcher (replaces vercel.json crons). Composed into the
 * deployed worker by cloudflare/worker.ts, which re-exports the OpenNext
 * `fetch` handler and wires this `scheduled` handler; wrangler `main` points at
 * that entry and `triggers.crons` fires these schedules.
 *
 * Each cron hits the existing CRON_SECRET-guarded route on the worker's own
 * public origin (`env.BASE_URL`), so no route logic changes. The schedules
 * mirror the former vercel.json entries.
 */
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
 * Cron expression to the routes it fires.
 *
 * A list per expression, not a single route: Cloudflare fires each schedule
 * once, and more than one pass can want the same cadence. With a bare
 * `Record<string, string>` the second five-minute pass added would have
 * silently replaced the first: a whole subsystem quietly not running, with
 * nothing to notice it by.
 */
export const CRON_ROUTES: Record<string, string[]> = {
  "0 0 * * *": [
    // Repairs team membership a failed API call left wrong. Nightly rather
    // than more often on purpose: every membership change already fires on
    // the platform event that caused it, so if this pass is doing meaningful
    // work regularly then something upstream is broken and a tighter cadence
    // would hide it.
    "/cron/github-reconcile",
    // Supabase OAuth access tokens last 24h, so daily has ample margin. Runs
    // BEFORE the reconcile below, which needs those tokens to ask whether each
    // project still exists. Reversing them would have the reconcile skip every
    // environment whose grant lapsed overnight.
    "/cron/sandbox-refresh",
    // Project existence, status drift, 90-day pause expiry, auto-pause. The
    // sole authority on orphaning: the proxy must never conclude a project is
    // gone, because a transient upstream error would tear down a healthy
    // environment's credentials and secrets.
    "/cron/sandbox-reconcile",
  ],
  // Airtable polls rather than subscribes. Webhooks exist but expire on a
  // 7-day refresh cycle and deliver cursor-based payloads that have to be
  // replayed in order, real complexity for a club calendar that changes a
  // few times a week. At ~5 requests a pass this is ~13% of the monthly
  // allowance, and the manual trigger covers the case where 15 minutes is too
  // long to wait.
  "*/15 * * * *": ["/airtable/sync"],
  "*/10 * * * *": ["/cron/sync-discord-roles"],
  "*/5 * * * *": [
    // Freezes `teams."competedAt"` once judging begins. Five minutes rather
    // than ten because the window between judging starting and this running
    // is the window in which closing a PR costs a team its star.
    "/cron/judging-start",
    // Separate from the freeze despite the shared cadence: the tally blocks
    // on ungraded competitions and on a missing tiebreak ballot, and freezing
    // participation must happen whether or not grading is done.
    "/cron/tally-elections",
    // Wakes sandbox environments with a competition starting inside fifteen
    // minutes. Five minutes rather than ten because a restore takes 196s
    // (measured) and the lead time has to absorb a tick landing badly.
    "/cron/sandbox-prewarm",
  ],
};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const paths = CRON_ROUTES[event.cron];
  if (!paths) return;

  // Sequential rather than concurrent: these passes share a connection pool,
  // and a five-minute cadence has no deadline that parallelism would help.
  for (const path of paths) {
    await fetch(`${env.BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
  }
}
