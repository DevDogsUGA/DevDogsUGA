/**
 * PKCE (RFC 7636) helpers for the one-click OAuth connect flow.
 *
 * `devtools oauth` is a public client with no way to hold a secret (it is a
 * CLI running on a contributor's machine), so the platform's `/oauth/connect` flow relies on PKCE instead: a random verifier stays local, only
 * its SHA-256 challenge crosses the network in the authorization request,
 * and the verifier itself is sent once, at the very end, to the token
 * exchange — see `exchange.ts`. `state` is the separate, unrelated defense
 * against a forged callback (`loopback.ts` checks it), not part of PKCE
 * proper, but generated the same way and kept here since every caller wants
 * both together.
 */
import { createHash, randomBytes } from "node:crypto";

/** Base64url, no padding — the encoding both the verifier and challenge use (RFC 7636 §4.1, §4.2). */
function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A cryptographically random PKCE code verifier: 32 bytes, base64url-encoded (43 characters). */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** The S256 code challenge for `verifier` — `BASE64URL(SHA256(verifier))`. */
export function codeChallengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** A random `state` value, opaque to the caller, tying an authorization request to its callback. */
export function generateState(): string {
  return base64url(randomBytes(16));
}
