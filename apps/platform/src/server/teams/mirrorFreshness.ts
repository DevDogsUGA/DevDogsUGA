/**
 * How old `teams.githubSyncedAt` gets before the dashboard says so.
 *
 * Three nightly `github-reconcile` cycles' worth of slack, not one: a single
 * missed cron run is uneventful (the next one, and the webhook route in
 * between, both catch up), and flagging on it would make "stale" the normal
 * state of every team's dashboard the morning after an ordinary skipped run.
 * Three misses in a row -- roughly three days, since the cron is nightly --
 * is the signal something upstream (the webhook, the cron trigger itself) is
 * actually broken and nobody has noticed yet.
 */
export const MIRROR_STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 3;

/**
 * Whether a team's mirror is old enough to flag.
 *
 * Null counts as stale -- a row with no `githubSyncedAt` at all has never
 * been confirmed against GitHub, which is a stronger reason to say so than
 * any age threshold. `now` is a parameter, not `new Date()` called inside,
 * so a page rendering many teams computes it once and every card agrees on
 * what "now" means.
 */
export function isMirrorStale(githubSyncedAt: Date | null, now: Date): boolean {
  if (githubSyncedAt === null) return true;
  return now.getTime() - githubSyncedAt.getTime() > MIRROR_STALE_AFTER_MS;
}
