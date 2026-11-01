/**
 * The one GitHub transport for the commit sync (D0 section 8.7): every repo,
 * inside the org or out, is read with the read-only App's DevDogsUGA
 * installation token. Nothing here ever sends an anonymous request, because
 * the 60-per-hour anonymous limit belongs to a Cloudflare egress IP shared by
 * unrelated Workers. The config writer App (`GH_CONFIG_APP_*`) is never used.
 *
 * Every expected failure comes back as a typed `GithubResult`; only a
 * programming error (a malformed path) throws.
 */
import { appJwt, type AppCredentials, type Fetch } from "../config/githubApp";

/**
 * How a failed call should be treated (D0 section 4, "Failure classes"):
 *
 * - `auth`: 401, an installation that is gone, or a 403 that is not a rate
 *   limit. The job fails and alerts; no repo is marked unavailable for it.
 * - `rate`: 429, or a 403 carrying a rate-limit signal. Deferred to the reset.
 * - `unavailable`: 404 or 451. The repo is private, deleted or blocked, and
 *   GitHub cannot say which, so callers never claim "deleted".
 * - `retry`: 5xx, a timeout or an unreadable body. Health is left as it was.
 * - `empty`: 409, an empty repository. Available, with no commits.
 * - `branch`: 422, a stale branch name. Refresh the repo's metadata.
 * - `budget`: this invocation's request or time budget is spent.
 */
export type FailureKind =
  "auth" | "rate" | "unavailable" | "retry" | "empty" | "branch" | "budget";
export type GithubResult<T> =
  | { ok: true; data: T; next: boolean }
  | { ok: false; kind: FailureKind; message: string; retryAt: Date };

/** Requests and wall-clock one invocation may spend (D0 section 5). */
export const MAX_REQUESTS = 100;
export const MAX_MS = 45_000;
/**
 * Listing and backfill work stops here instead, leaving the last stretch of
 * the budget to size hydration, so a long backfill cannot starve it.
 */
const WORK_REQUESTS = 65;
const WORK_RESERVE_MS = 15_000;

export type Budget = { requests: number; deadline: number };
export const newBudget = (maxMs = MAX_MS): Budget => ({
  requests: 0,
  deadline: Date.now() + maxMs,
});
/** Whether listing or backfill work may take another request. */
export const hasRoom = (budget: Budget) =>
  budget.requests < WORK_REQUESTS &&
  Date.now() < budget.deadline - WORK_RESERVE_MS;
const failure = (
  kind: FailureKind,
  message: string,
  delay = 60_000,
): Extract<GithubResult<never>, { ok: false }> => ({
  ok: false,
  kind,
  message,
  retryAt: new Date(Date.now() + delay),
});

/** Shared REST transport, including the App's own authentication calls. */
export class GithubClient {
  private cached?: { token: string; expires: number };
  private blockedUntil = 0;
  constructor(
    private credentials: AppCredentials,
    private doFetch: Fetch = fetch,
  ) {}

  /**
   * One authenticated call, bounded by the invocation budget and the
   * installation's rate limit. It pins API version 2022-11-28, reads the
   * rate-limit headers and stops spending once 20% of the window is left,
   * and backs off on 403/429 and `Retry-After`. `token` is for the App's own
   * JWT calls; everything else uses the cached installation token.
   */
  async githubFetch<T>(
    path: string,
    budget: Budget,
    token?: string,
    body?: unknown,
  ): Promise<GithubResult<T>> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Expected a GitHub API path");
    if (Date.now() < this.blockedUntil)
      return {
        ...failure("rate", "GitHub rate budget deferred"),
        retryAt: new Date(this.blockedUntil),
      };
    if (!token) {
      const result = await this.orgInstallationToken(budget);
      if (!result.ok) return result;
      token = result.data;
    }
    if (budget.requests >= MAX_REQUESTS || Date.now() >= budget.deadline)
      return failure("budget", "Invocation budget exhausted", 0);
    budget.requests++;
    try {
      const response = await this.doFetch(`https://api.github.com${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "devdogs-platform-commits",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(10_000, budget.deadline - Date.now())),
        ),
      });
      const remaining = Number(
        response.headers.get("x-ratelimit-remaining") ?? NaN,
      );
      const limit = Number(response.headers.get("x-ratelimit-limit") ?? NaN);
      const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
      const retry = response.headers.get("retry-after");
      const retryTime = retry
        ? /^\d+$/.test(retry)
          ? Date.now() + Number(retry) * 1000
          : Date.parse(retry)
        : 0;
      const rate =
        response.status === 429 ||
        (response.status === 403 && (remaining === 0 || !!retry));
      // Secondary limits can return only a message, without Retry-After.
      const data: unknown = await response.json();
      const secondary =
        response.status === 403 &&
        JSON.stringify(data).toLowerCase().includes("rate limit");
      if (
        (Number.isFinite(limit) && remaining <= limit * 0.2) ||
        rate ||
        secondary
      )
        this.blockedUntil = Math.max(
          Date.now() + 60_000,
          reset || 0,
          retryTime || 0,
        );
      if (rate || secondary)
        return {
          ...failure("rate", "GitHub throttled the read App"),
          retryAt: new Date(this.blockedUntil),
        };
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.cached = undefined;
          return failure(
            "auth",
            "GitHub read App authentication or permissions failed",
          );
        }
        if (response.status === 404 || response.status === 451)
          return failure("unavailable", "Repository unavailable");
        if (response.status === 409)
          return failure("empty", "Repository is empty");
        if (response.status === 422)
          return failure("branch", "Refresh repository branch metadata");
        return failure("retry", `GitHub answered ${response.status}`);
      }
      return {
        ok: true,
        data: data as T,
        next: (response.headers.get("link") ?? "").includes('rel="next"'),
      };
    } catch {
      return failure(
        "retry",
        "GitHub request timed out or returned an invalid response",
      );
    }
  }

  /** The read App's org installation, cached until one minute before expiry. */
  async orgInstallationToken(budget: Budget): Promise<GithubResult<string>> {
    if (this.cached && this.cached.expires > Date.now() + 60_000)
      return { ok: true, data: this.cached.token, next: false };
    if (!this.credentials.appId || !this.credentials.privateKey)
      return failure("auth", "GitHub read App is not configured");
    let jwt: string;
    try {
      jwt = await appJwt(this.credentials.appId, this.credentials.privateKey);
    } catch {
      return failure("auth", "GitHub read App key is invalid");
    }
    const installation = await this.githubFetch<{ id: number }>(
      "/orgs/DevDogsUGA/installation",
      budget,
      jwt,
    );
    if (!installation.ok)
      return {
        ...installation,
        kind: installation.kind === "unavailable" ? "auth" : installation.kind,
      };
    const result = await this.githubFetch<{
      token: string;
      expires_at: string;
    }>(
      `/app/installations/${installation.data.id}/access_tokens`,
      budget,
      jwt,
      // Read-only, and only what a public read needs. No Contents grant.
      { permissions: { metadata: "read" } },
    );
    if (!result.ok)
      return {
        ...result,
        kind: result.kind === "unavailable" ? "auth" : result.kind,
      };
    if (
      !result.data.token ||
      !Number.isFinite(Date.parse(result.data.expires_at))
    )
      return failure("auth", "Invalid installation token response");
    this.cached = {
      token: result.data.token,
      expires: Date.parse(result.data.expires_at),
    };
    return { ok: true, data: result.data.token, next: false };
  }
}
