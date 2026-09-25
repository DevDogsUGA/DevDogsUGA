/**
 * Mints a fresh per-request CSP nonce: 16 random bytes (128 bits, the
 * minimum the CSP3 spec recommends) from the Web Crypto API, base64-encoded.
 * `crypto.getRandomValues` is available in every runtime this workspace
 * targets (Edge middleware, Workers, browsers, Node >=19) with no import.
 *
 * Callers mint one nonce per request in `middleware.ts` and thread it both
 * into the CSP header (`buildContentSecurityPolicy`/`buildSecurityHeaders`)
 * and onto the outgoing *request* headers, so vinext's renderer
 * (`getScriptNonceFromHeaderSources`) can read the same value back out and
 * stamp it on every script/style tag it emits -- see `csp.ts`'s file-level
 * doc comment.
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
