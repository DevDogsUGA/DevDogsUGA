/**
 * Verifying GitHub's own signature on a webhook delivery.
 *
 * GitHub signs the RAW request body with the webhook's shared secret and
 * sends the hex digest as `X-Hub-Signature-256: sha256=<hex>`. Verified
 * against the raw bytes as delivered, never against a `JSON.parse` /
 * `JSON.stringify` round trip -- whitespace and key order in the original
 * body are not guaranteed to survive that, and a route that re-serializes
 * before checking would silently accept a body GitHub never actually signed.
 *
 * `crypto.subtle`, not Node's `crypto.createHmac`: this route runs on
 * Cloudflare Workers, where only the Web Crypto API exists.
 */

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison.
 *
 * A signature check that short-circuits on the first mismatched character
 * leaks, one bit at a time over many requests, how much of a guess was
 * right. `equalConstantTime` in `lib/attendanceChallenge.ts` does the same
 * job over byte arrays; this is the hex-string form, kept local rather than
 * shared because pulling a client-safe `lib/` helper into a webhook route for
 * one string compare is more coupling than the four lines it saves.
 */
function equalConstantTime(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

/**
 * Whether `header` (the request's `X-Hub-Signature-256` value) is a valid
 * signature of `rawBody` under `secret`.
 *
 * Returns false rather than throwing on every malformed-input shape --
 * missing header, wrong prefix -- so the route can treat "invalid" and
 * "absent" identically without a try/catch of its own.
 */
export async function verifyGithubSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const supplied = header.slice("sha256=".length);
  const expected = await hmacHex(secret, rawBody);
  return equalConstantTime(supplied, expected);
}
