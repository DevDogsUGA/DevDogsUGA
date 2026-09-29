/**
 * Read-only Sentry checks, gated on the same `SENTRY_AUTH_TOKEN` presence
 * check `.github/workflows/deploy-app.yaml`'s own release step already uses
 * (`if: env.SENTRY_AUTH_TOKEN == ''`) -- Sentry is genuinely optional here
 * (the org may not be onboarded yet), and an absent token must read as a
 * skip with a notice, never as a failure.
 *
 * Neither check sends Sentry anything. "Sentry test event lands" (the
 * literal ask) would mean generating a synthetic error and polling for it
 * to appear -- a write against a third-party system, which is out of scope
 * (state-changing flows are out of scope generally, and a manufactured
 * error is noise in a real project's issue stream regardless). What IS
 * read-only and still answers "is the Sentry pipeline actually working for
 * this deploy": whether the release `deploy-app.yaml`'s own
 * `getsentry/action-release` step just created is visible back from the
 * API. That proves this deploy's release reached Sentry without creating
 * an event.
 *
 * There is deliberately no check on Crons monitors. The deploy token is an
 * organization token, which Sentry never lets read monitors (403), and
 * "some check-in on record" passed forever once a job had reported, so it
 * could not tell a healthy deploy from a broken one. Sentry itself opens an
 * issue when a monitored job misses a check-in or overruns (the margins are
 * in apps/platform/cloudflare/scheduled.ts), against the real schedule.
 */
import type { CheckResult, FetchLike } from "./checks.js";

export interface SentryConfig {
  readonly org: string;
  readonly project: string;
  readonly authToken: string;
}

const SENTRY_API = "https://sentry.io/api/0";

/** `undefined` org/project/token (the common case) reads as "not configured". */
export function resolveSentryConfig(env: {
  SENTRY_AUTH_TOKEN?: string;
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
}): SentryConfig | undefined {
  if (!env.SENTRY_AUTH_TOKEN) return undefined;
  if (!env.SENTRY_ORG || !env.SENTRY_PROJECT) return undefined;
  return {
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    authToken: env.SENTRY_AUTH_TOKEN,
  };
}

export function skippedSentryCheck(name: string): CheckResult {
  return {
    name,
    status: "skip",
    detail:
      "SENTRY_AUTH_TOKEN is not configured -- Sentry org not onboarded yet.",
  };
}

/** Confirms this deploy's release (the `release` upload deploy-app.yaml's
 * action-release step made) is visible from the API. */
export async function checkSentryRelease(
  config: SentryConfig,
  release: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const name = `Sentry release ${config.project}@${release}`;
  const url = `${SENTRY_API}/organizations/${config.org}/releases/${encodeURIComponent(release)}/`;
  try {
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${config.authToken}` },
    });
    if (!response.ok) {
      return {
        name,
        status: "fail",
        detail: `HTTP ${response.status} from ${url}`,
      };
    }
    return { name, status: "pass", detail: "release visible" };
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
