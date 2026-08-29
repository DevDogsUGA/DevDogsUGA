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
 * The prefix match, against one exact string.
 *
 * The trailing slash in each prefix matters. Without it `/restaurants` matches
 * `/rest`, which is the classic prefix-matching bug and here would mean
 * classifying an unknown path as a known one.
 */
function classifyExact(pathname: string): PathClass {
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
 * Classify an ALREADY-NORMALIZED pathname.
 *
 * Normalization is not this function's job and must not be attempted here with
 * string manipulation. `new URL()` resolves `..` and `.` segments, so
 * classifying `url.pathname` is safe where classifying a raw request-target
 * string is not: a hand-rolled `startsWith` against
 * `/storage/v1/../../rest/v1/users` would answer "storage" for a request the
 * origin will treat as REST.
 *
 * ## What `new URL()` does NOT do
 *
 * It resolves dot segments; it does not PERCENT-DECODE. So
 * `/storage/v1/%2e%2e%2f%2e%2e%2fpg/query` arrives here byte-for-byte intact,
 * `startsWith("/storage/v1/")` is true, and the allowlist waves through a path
 * that names `/pg/query` the moment anything downstream decodes it. Whether the
 * Supabase gateway decodes before routing is not a question this file gets to
 * leave open: the allowlist cannot be the security boundary while the string it
 * matches differs from the string the origin routes on.
 *
 * So the path is decoded, re-resolved, and classified a second time. It is
 * refused only when decoding CHANGES the answer, which is what keeps a storage
 * key legitimately containing `%2F` classified as storage while refusing a
 * traversal that escapes the prefix it claimed.
 */
export function classifyPath(pathname: string): PathClass {
  const direct = classifyExact(pathname);

  let decoded: string;
  try {
    // Back through `new URL()`, because decoding can expose dot segments that
    // were hidden from the first normalization pass.
    decoded = new URL(decodeURIComponent(pathname), "https://sandbox.invalid")
      .pathname;
  } catch {
    // Malformed percent-encoding. Refused rather than guessed at -- we cannot
    // say what the origin would make of it.
    return "unknown";
  }

  if (decoded !== pathname && classifyExact(decoded) !== direct) {
    return "unknown";
  }
  return direct;
}

/**
 * Realtime carries its key in the query string rather than a header, because a
 * browser WebSocket constructor cannot set headers. That makes it the one class
 * where the token appears somewhere other than `apikey`/`Authorization`, and
 * the one place a rewrite can be forgotten.
 *
 * It is also the one class where `Sec-WebSocket-Protocol` may carry the token,
 * for the same reason -- see `extractCredential`.
 */
export function usesRealtimeCarriers(kind: PathClass): boolean {
  return kind === "realtime";
}
