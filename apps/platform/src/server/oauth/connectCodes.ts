import { createHash, randomBytes } from "node:crypto";

/**
 * Crypto helpers for the `devtools oauth` connect handoff
 * (`/tools/oauth/connect` → `/tools/oauth/connect/exchange`, migration 32's
 * `oauthConnectCodes` table). Kept out of the action/route files so both
 * sides of the handoff hash things the same way without importing from each
 * other.
 */

const CODE_BYTES = 32;

/** A fresh, unguessable single-use code, and the hash that gets stored. */
export function generateConnectCode(): { code: string; codeHash: string } {
  const code = randomBytes(CODE_BYTES).toString("base64url");
  return { code, codeHash: hashConnectCode(code) };
}

/** sha256 of a code, hex-encoded -- what `oauthConnectCodes.codeHash` stores. */
export function hashConnectCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * PKCE S256: base64url(sha256(verifier)), no padding. Node's `"base64url"`
 * digest encoding already omits padding, matching RFC 7636 exactly -- no
 * separate strip-padding step needed.
 */
export function challengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
