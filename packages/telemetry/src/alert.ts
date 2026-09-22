import { captureMessage, getClient } from "@sentry/core";
import { TAG_KEYS } from "./constants.js";

/**
 * The successor to platform's `postAlert` (formerly
 * `apps/platform/src/server/discord/alerts.ts`, which posted to Discord and
 * has been deleted). Same job, different sink: a `Sentry.captureMessage` at
 * `warning` level, fingerprinted by `title` so every distinct alert groups
 * into one Sentry issue instead of a new issue per call.
 *
 * Imports from `@sentry/core`, not `@sentry/node`/`@sentry/cloudflare`/
 * `@sentry/nextjs`. All three of those SDKs — and this package's consumers
 * span all three, across Node and Workers — build on `@sentry/core` and
 * write into the same global carrier when they call `Sentry.init()`. Calling
 * `@sentry/core`'s `captureMessage`/`getClient` therefore reaches whichever
 * SDK a given surface actually initialized, without this package needing a
 * runtime-specific dependency or a client passed at every call site.
 *
 * CALLERS OWN TRANSITION-ONLY FIRING. This function sends unconditionally,
 * exactly like the Discord `postAlert` it replaces — it has no memory of the
 * last time a given title fired. The alerting philosophy in this workspace
 * (see packages/telemetry/README.md) is to alert on state transitions (a
 * check going from passing to failing, a new kind of failure appearing), not
 * once per failed run. Call sites are responsible for only calling `alert`
 * on a transition; this function does not — and cannot, since it holds no
 * state — enforce that.
 *
 * NEVER THROWS. Same contract as `postAlert`: this is called from inside
 * passes whose actual job is something else, so a failure to alert must not
 * turn a handled refusal into an unhandled exception.
 *
 * No-ops (does not throw, sends nothing) if no Sentry client is initialized
 * — i.e. no DSN configured for this service, same as the DSN-empty
 * convention `buildSentryOptions` follows.
 */
export function alert(
  title: string,
  lines: string[],
  opts: { tags?: Record<string, string> } = {},
): void {
  try {
    if (!getClient()) return;

    const message = [title, ...lines.map((line) => `• ${line}`)].join("\n");

    captureMessage(message, {
      level: "warning",
      fingerprint: ["alert", title],
      tags: { [TAG_KEYS.ALERT]: "true", ...opts.tags },
    });
  } catch (e) {
    console.error("[telemetry] alert() failed", e);
  }
}
