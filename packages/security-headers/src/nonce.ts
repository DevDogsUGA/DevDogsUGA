/**
 * Mints a fresh per-request CSP nonce: 16 random bytes (128 bits, the
 * minimum the CSP3 spec recommends) from the Web Crypto API, base64-encoded.
 * `crypto.getRandomValues` is available in every runtime this workspace
 * targets (Edge middleware, Workers, browsers, Node >=19) with no import.
 *
 * One nonce per response: `apps/schedule-builder` mints it in middleware and
 * writes it onto the request headers for vinext's renderer to read back;
 * `apps/platform` mints it in its Worker entry and stamps it onto the finished
 * HTML. See `csp.ts`'s file-level doc comment.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
