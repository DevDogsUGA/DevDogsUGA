/**
 * Shared constants for every Sentry-reporting surface in the workspace.
 *
 * Kept dependency-free (no `@sentry/*` imports here) so that importing just
 * the constants — e.g. from a script deciding what environment string to
 * pass — never pulls in the SDK.
 */

/** The four Sentry projects. Browser + server for a Next app share one. */
export const SERVICES = [
  "platform",
  "schedule-builder",
  "sandbox",
  "devtools",
] as const;

export type Service = (typeof SERVICES)[number];

export function isService(value: string): value is Service {
  return (SERVICES as readonly string[]).includes(value);
}

/**
 * Deploy/runtime environments this workspace reports under. `production` and
 * `staging` are real Sentry environments (both report, alert rules are
 * production-only and configured in the Sentry UI). `development` covers the
 * two Next apps' local dev. `ci` and `local` are devtools' own pair, chosen
 * by whether it is running inside CI.
 */
export const ENVIRONMENTS = [
  "production",
  "staging",
  "development",
  "ci",
  "local",
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/**
 * `tracesSampleRate` by environment. Every environment not listed samples at
 * 0 — that is the "else 0" branch, not an omission, and covers `development`,
 * `ci`, and `local` today without needing an entry each.
 */
const TRACES_SAMPLE_RATE_BY_ENVIRONMENT: Partial<Record<Environment, number>> =
  {
    production: 0.2,
    staging: 0.05,
  };

export function tracesSampleRateFor(environment: string): number {
  return TRACES_SAMPLE_RATE_BY_ENVIRONMENT[environment as Environment] ?? 0;
}

/** Errors are 100% sampled everywhere — no table needed, but named so call
 * sites read as a decision rather than a magic number. */
export const ERROR_SAMPLE_RATE = 1;

/**
 * Tag keys every surface should spell the same way, so a Sentry search for
 * `service:platform` or `alert:true` works regardless of which app or
 * package produced the event.
 */
export const TAG_KEYS = {
  /** Which of {@link SERVICES} produced the event. */
  SERVICE: "service",
  /** Set to `"true"` on every event sent through {@link alert}. */
  ALERT: "alert",
} as const;
