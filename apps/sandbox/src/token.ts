/**
 * Finding the member token on a request, and deciding what it is.
 *
 * Every value here comes from an untrusted caller, so each function answers a
 * question about a string rather than trusting the caller's framing of it.
 */

/** The prefixes, mirroring upstream's `sb_publishable_` / `sb_secret_`. */
export const PUBLISHABLE_PREFIX = "dd_publishable_";
export const SECRET_PREFIX = "dd_secret_";

export function isMemberToken(value: string): boolean {
  return (
    value.startsWith(PUBLISHABLE_PREFIX) || value.startsWith(SECRET_PREFIX)
  );
}

/**
 * A Supabase-issued user JWT, as opposed to a member token or an upstream key.
 *
 * Deliberately structural rather than cryptographic: the proxy does NOT verify
 * these. Upstream does, with the signing key, and duplicating that at the edge
 * would mean holding the environment's JWT secret for no gain -- a second copy
 * of a key, to re-answer a question the origin answers anyway. All this decides
 * is "pass through" versus "treat as a key to swap".
 */
export function looksLikeJwt(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export interface PresentedCredential {
  /** The member token, if one was found. */
  token: string | null;
  /**
   * A user JWT presented in `Authorization`, to be forwarded untouched.
   * Null when `Authorization` carried a member token instead, or nothing.
   */
  userJwt: string | null;
}

/**
 * Pull the member token off a request.
 *
 * supabase-js sends the key in BOTH `apikey` and `Authorization: Bearer` when
 * no user session exists, and swaps `Authorization` for the user's JWT once one
 * does. So `Authorization` is sometimes a key and sometimes a session, and the
 * two have to be told apart before either is forwarded.
 *
 * Getting this wrong in the lenient direction leaks the member's token to
 * Supabase on every unauthenticated request; getting it wrong in the other
 * direction breaks sessions.
 */
export function extractCredential(
  request: Request,
  url: URL,
  allowQueryParam: boolean,
): PresentedCredential {
  const headerKey = request.headers.get("apikey");
  const auth = request.headers.get("authorization");
  const bearer =
    auth && /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "") : null;

  // Only for realtime, and only because a browser WebSocket cannot set headers.
  // Accepting a query-param key on every path would mean any request could
  // carry credentials in a URL, where they land in logs and Referer headers.
  const queryKey = allowQueryParam ? url.searchParams.get("apikey") : null;

  const token =
    [headerKey, bearer, queryKey].find(
      (candidate): candidate is string =>
        typeof candidate === "string" && isMemberToken(candidate),
    ) ?? null;

  const userJwt =
    bearer && !isMemberToken(bearer) && looksLikeJwt(bearer) ? bearer : null;

  return { token, userJwt };
}

/**
 * Does this look like a browser?
 *
 * Upstream refuses secret keys from browsers by matching on `User-Agent`, and
 * the proxy mirrors that. It is not a security control -- a header is trivially
 * forged, and a member who forges it only reaches a key they already hold. It
 * is a FIDELITY control: without it a student ships `dd_secret_` to the browser,
 * it works all week against the sandbox, and the identical code 401s in
 * production. Catching it at the moment it is written is the entire point.
 */
export function looksLikeBrowser(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /mozilla|chrome|safari|firefox|edge|opera/i.test(userAgent);
}

/** Hex-encoded SHA-256, matching how tokens are stored. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
