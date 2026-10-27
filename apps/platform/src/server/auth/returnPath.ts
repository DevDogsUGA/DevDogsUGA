/**
 * Where a visitor lands after signing in, taken from a query string or a
 * cookie and therefore never trusted.
 *
 * Only a same-site path survives: it must start with a single `/`, carry no
 * backslash or control character (browsers read `/\evil.example` and
 * `/%09/evil.example` as protocol-relative), and resolve to the site's own
 * origin. Sign-in routes are refused too, so a return path can't send someone
 * round the handshake again. Anything else becomes `fallback`.
 */
const ORIGIN = "https://devdogsuga.invalid";
const MAX_LENGTH = 2048;

export function safeReturnPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== ORIGIN) return fallback;
  if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) {
    return fallback;
  }
  // Dot segments can normalise into a protocol-relative path
  // (`/.//evil.example` becomes `//evil.example`), so check the result too.
  const safe = url.pathname + url.search + url.hash;
  if (safe.startsWith("//") || safe.includes("\\")) return fallback;
  return safe;
}
