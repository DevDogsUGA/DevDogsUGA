import { alert } from "@devdogsuga/telemetry";

/**
 * Platform's operational alert sink.
 *
 * Successor to the deleted `server/discord/alerts.ts`, which posted to a
 * Discord channel. The Discord webhook plumbing (the bot client, the
 * `DISCORD_ALERT_CHANNEL_ID` env var) is gone; this wraps
 * `@devdogsuga/telemetry`'s `alert()`, which is a `Sentry.captureMessage` at
 * `warning` level instead.
 *
 * Kept as a thin app-local wrapper -- rather than call sites importing
 * `alert` from `@devdogsuga/telemetry` directly -- for two reasons:
 *
 * 1. Call-site churn: every existing call passes a `footer` as a third
 *    positional string argument (`postAlert(title, lines, footer)`), the
 *    same shape the old Discord version had. `alert()`'s third parameter is
 *    an options object (`{ tags }`), not a string, so preserving the
 *    original signature here means every call site only had to change its
 *    import path, not its call.
 * 2. `postAlert` is the name every call site and every doc page
 *    (docs/platform/guides/meetings-and-teams/events.md,
 *    docs/platform/guides/meetings-and-teams/competitions.md) already uses
 *    for "the thing that posts an operational alert." Renaming it
 *    everywhere would be churn with no benefit -- the sink changed, not the
 *    concept.
 *
 * Same contracts as before: NEVER THROWS (this is called from inside passes
 * whose actual job is something else), and callers still own transition-only
 * firing -- this function, like `alert()` underneath it, sends
 * unconditionally every time it is called.
 */
export async function postAlert(
  title: string,
  lines: string[],
  footer?: string,
): Promise<void> {
  alert(title, footer ? [...lines, "", footer] : lines);
}
