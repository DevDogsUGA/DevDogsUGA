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
 * would mean keeping a second copy of the environment's JWT secret to
 * re-answer a question the origin answers anyway. All this decides is "pass
 * through" versus "refuse".
 *
 * The segments must be non-empty base64url. A three-dot check alone accepted
 * `a.b.c`, and anything it accepted was forwarded to Supabase as a session.
 */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function looksLikeJwt(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => BASE64URL.test(p));
}

export interface PresentedCredential {
  /** The member token, if one was found. */
  token: string | null;
  /**
   * A user JWT presented in `Authorization`, to be forwarded untouched.
   * Null when `Authorization` carried a member token instead, or nothing.
   */
  userJwt: string | null;
  /**
   * `Authorization: Bearer <x>` where x is neither a member token nor
   * JWT-shaped.
   *
   * Reported rather than ignored: with no flag, such a bearer fell through to
   * `userJwt = null` and the request went upstream carrying the project key, so
   * an expired or corrupted session was answered `200` as `anon` where real
   * Supabase answers `401`. A sandbox that succeeds where production fails is
   * the one outcome this proxy exists to prevent.
   */
  malformedBearer: boolean;
}

/**
 * Which credential carriers this path class permits beyond the two headers.
 *
 * Both are realtime-only for the same reason, so they travel together: a
 * browser `WebSocket` constructor can set neither headers nor much else.
 */
export interface RealtimeCarriers {
  queryParam: boolean;
  protocol: boolean;
}

/**
 * Every query parameter named `apikey`, in whatever case it was written.
 *
 * `URLSearchParams` matches byte-for-byte while every header lookup around it
 * is case-insensitive, and that asymmetry was a hole: the realtime rewrite
 * tested `has("apikey")`, so `?APIKEY=` skipped it and the member's token went
 * to Supabase in the URL. Both the read and the rewrite go through this.
 */
export function apikeyParamNames(params: URLSearchParams): string[] {
  const names = new Set<string>();
  for (const name of params.keys()) {
    if (name.toLowerCase() === "apikey") names.add(name);
  }
  return [...names];
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
  carriers: RealtimeCarriers,
): PresentedCredential {
  const headerKey = request.headers.get("apikey");
  const auth = request.headers.get("authorization");
  const bearer =
    auth && /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "") : null;

  // Only for realtime, and only because a browser WebSocket cannot set headers.
  // Accepting a query-param key on every path would mean any request could
  // carry credentials in a URL, where they land in logs and Referer headers.
  const queryKey = carriers.queryParam
    ? (apikeyParamNames(url.searchParams)
        .map((name) => url.searchParams.get(name))
        .find((value): value is string => value !== null) ?? null)
    : null;

  // The other half of the same carve-out. `buildUpstreamRequest` has always
  // REWRITTEN a `dd_`-prefixed subprotocol, so the header was treated as a
  // credential location on the way out while being invisible on the way in. The
  // header-less browser handshake the carve-out exists for was then answered
  // 401 for want of a credential it was carrying all along.
  const protocolKey = carriers.protocol
    ? (protocolEntries(request).find(isMemberToken) ?? null)
    : null;

  const token =
    [headerKey, bearer, queryKey, protocolKey].find(
      (candidate): candidate is string =>
        typeof candidate === "string" && isMemberToken(candidate),
    ) ?? null;

  const bearerIsMember = bearer !== null && isMemberToken(bearer);
  const userJwt =
    bearer && !bearerIsMember && looksLikeJwt(bearer) ? bearer : null;

  return {
    token,
    userJwt,
    malformedBearer: bearer !== null && !bearerIsMember && userJwt === null,
  };
}

/** `Sec-WebSocket-Protocol` as a trimmed list, empty when absent. */
export function protocolEntries(request: Request): string[] {
  const raw = request.headers.get("sec-websocket-protocol");
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Does this look like a browser?
 *
 * Upstream refuses secret keys from browsers by matching on `User-Agent`, and
 * the proxy mirrors that. It is not a security control: a header is easy to
 * forge, and a member who forges it only reaches a key they already hold. It is
 * a FIDELITY control. Without it a student ships `dd_secret_` to the browser, it
 * works all week against the sandbox, and the identical code 401s in
 * production. Catching it at the moment it is written is the point.
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
