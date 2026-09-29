/**
 * Pure, unit-testable check functions. Every one takes a `fetchImpl`
 * parameter (defaulting to the global `fetch`) so the CLIs that wire these
 * up against a real deployed host can be tested here against a stub instead
 * -- see checks.test.ts.
 */

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; redirect?: "manual" | "follow" },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

/**
 * Retries a request that got a 503 while a new Worker version is still
 * propagating.
 *
 * Right after `wrangler deploy`, vinext's Cloudflare gateway can reach a
 * response-stage entrypoint still running the previous build. It refuses to
 * forward that response and answers a bare 503 instead
 * (`validateResponseStageBuildIdentity` in `@vinext/cloudflare`'s
 * `cdn-adapter.worker.js`). The platform hit this on its first deploy with
 * cached pages: the post-deploy reconcile got a 503, and the same call
 * succeeded a few minutes later. Every route these checks call is safe to
 * repeat (reconcile upserts), so a 503 is retried and anything else is
 * returned as-is.
 */
export function retryWhilePropagating(
  fetchImpl: FetchLike = fetch,
  {
    attempts = 12,
    delayMs = 10_000,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }: {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): FetchLike {
  return async (url, init) => {
    for (let attempt = 1; ; attempt++) {
      const response = await fetchImpl(url, init);
      if (response.status !== 503 || attempt >= attempts) return response;
      await sleep(delayMs);
    }
  };
}

/** A public route must answer 200. */
export async function checkPublicRoute(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const name = `GET ${url}`;
  try {
    const response = await fetchImpl(url);
    return response.status === 200
      ? { name, status: "pass", detail: "200" }
      : {
          name,
          status: "fail",
          detail: `expected 200, got ${response.status}`,
        };
  } catch (error) {
    return { name, status: "fail", detail: describeError(error) };
  }
}

/**
 * A protected route must redirect an anonymous request rather than serve
 * it. `redirect: "manual"` is load-bearing -- the default `fetch` behaviour
 * follows the redirect and reports the final response, which would make
 * this indistinguishable from a route that never gated at all.
 */
export async function checkProtectedRedirect(
  url: string,
  expectedLocationPrefix: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const name = `GET ${url} (unauthenticated)`;
  try {
    const response = await fetchImpl(url, { redirect: "manual" });
    if (response.status < 300 || response.status >= 400) {
      return {
        name,
        status: "fail",
        detail: `expected a redirect, got ${response.status}`,
      };
    }
    const location = response.headers.get("location") ?? "";
    // A redirect Location may be absolute (scheme + host) or root-relative;
    // normalise to a path before the prefix check so either form matches.
    const path = toPath(location);
    return path.startsWith(expectedLocationPrefix)
      ? { name, status: "pass", detail: `redirected to ${location}` }
      : {
          name,
          status: "fail",
          detail: `redirected to ${location}, expected it to start with ${expectedLocationPrefix}`,
        };
  } catch (error) {
    return { name, status: "fail", detail: describeError(error) };
  }
}

function toPath(location: string): string {
  try {
    return new URL(location).pathname + new URL(location).search;
  } catch {
    return location;
  }
}

/**
 * `GET /cron/config-reconcile`, authenticated. Unlike `devtools cron run`
 * (which only checks the HTTP status), this reads the JSON body: the route
 * answers 200 even when the reconcile itself failed
 * (`{ success: false, reason: … }`, see
 * apps/platform/src/app/(api)/cron/config-reconcile/route.ts), so an
 * HTTP-status-only check would never catch that failure.
 */
export async function checkReconcile(
  url: string,
  cronSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const name = `config-reconcile ${url}`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
  } catch (error) {
    return { name, status: "fail", detail: describeError(error) };
  }
  if (!response.ok) {
    return { name, status: "fail", detail: `HTTP ${response.status}` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: `non-JSON response: ${describeError(error)}`,
    };
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    (body as { success: unknown }).success === true
  ) {
    const counts =
      "counts" in body
        ? JSON.stringify((body as { counts: unknown }).counts)
        : "";
    return {
      name,
      status: "pass",
      detail: `succeeded${counts ? ` (${counts})` : ""}`,
    };
  }
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? String((body as { reason: unknown }).reason)
      : JSON.stringify(body);
  return {
    name,
    status: "fail",
    detail: `reconcile did not succeed: ${reason}`,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True if none of the results failed. Skips do not count against it. */
export function allPassed(results: readonly CheckResult[]): boolean {
  return results.every((result) => result.status !== "fail");
}

export function formatResults(results: readonly CheckResult[]): string {
  return results
    .map(
      (result) =>
        `${symbolFor(result.status)} ${result.name} -- ${result.detail}`,
    )
    .join("\n");
}

function symbolFor(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "[pass]";
    case "fail":
      return "[FAIL]";
    case "skip":
      return "[skip]";
  }
}
