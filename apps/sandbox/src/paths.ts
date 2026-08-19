/**
 * Which upstream service a request is for, if any.
 *
 * The allowlist IS the security boundary: anything unmatched is refused rather
 * than forwarded. A proxy that forwards unknown paths is a general-purpose
 * open relay to somebody's Supabase project, and the set of things reachable
 * that way grows every time Supabase ships a new service.
 */

export type PathClass =
  "rest" | "auth" | "storage" | "realtime" | "functions" | "unknown";

const PREFIXES: [string, PathClass][] = [
  ["/rest/v1/", "rest"],
  ["/auth/v1/", "auth"],
  ["/storage/v1/", "storage"],
  ["/realtime/v1/", "realtime"],
  ["/functions/v1/", "functions"],
];

/**
 * Classify an ALREADY-NORMALIZED pathname.
 *
 * Normalization is not this function's job and must not be attempted here with
 * string manipulation. `new URL()` resolves `..` and `.` segments and decodes
 * nothing that would change segment boundaries, so classifying `url.pathname`
 * is safe; classifying a raw request-target string is not. A hand-rolled
 * `startsWith` against `/storage/v1/../../rest/v1/users` would answer
 * "storage" for a request the origin will treat as REST.
 *
 * The trailing slash in each prefix matters. Without it `/restaurants` matches
 * `/rest`, which is the classic prefix-matching bug and here would mean
 * classifying an unknown path as a known one.
 */
export function classifyPath(pathname: string): PathClass {
  for (const [prefix, kind] of PREFIXES) {
    if (pathname.startsWith(prefix)) return kind;
  }
  // The bare service roots, which supabase-js does hit -- `/rest/v1/` with no
  // table is a valid OpenAPI request.
  for (const [prefix, kind] of PREFIXES) {
    if (pathname === prefix.slice(0, -1)) return kind;
  }
  return "unknown";
}

/**
 * Realtime carries its key in the query string rather than a header, because a
 * browser WebSocket constructor cannot set headers. That makes it the one class
 * where the token appears somewhere other than `apikey`/`Authorization`, and
 * the one place a rewrite can be forgotten.
 */
export function usesQueryParamKey(kind: PathClass): boolean {
  return kind === "realtime";
}
