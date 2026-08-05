/**
 * Member tokens: generating them, and hashing them for storage.
 *
 * Pure and dependency-free so the proxy Worker and the platform agree on the
 * format by construction rather than by two people remembering the same rule.
 * `apps/sandbox/src/token.ts` holds the Worker's half; these two files must
 * stay in step, and `tokens.test.ts` asserts the hash matches what the Worker
 * computes.
 */

export type ProxyScope = "publishable" | "secret";

export const PREFIXES: Record<ProxyScope, string> = {
  publishable: "dd_publishable_",
  secret: "dd_secret_",
};

/**
 * Mirroring upstream's `sb_publishable_` / `sb_secret_` is not cosmetic.
 *
 * It is what lets the planned CI secret scan on `team/**` branches pattern-match
 * at all, and what makes an accidental elevation visible in a diff: `dd_secret_`
 * appearing in a commit is legible to a human reviewer in a way an opaque
 * random string is not.
 */
export function tokenPrefix(scope: ProxyScope): string {
  return PREFIXES[scope];
}

/** 32 bytes of CSPRNG, base64url, unpadded. */
export function generateToken(scope: ProxyScope): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const body = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${tokenPrefix(scope)}${body}`;
}

/**
 * Hex-encoded SHA-256.
 *
 * Plain SHA-256 rather than a password hash, deliberately: these are 32 bytes
 * of CSPRNG output, not a human-chosen secret, so there is nothing to brute
 * force and the per-request cost of bcrypt would land on the proxy's hot path.
 * The same reasoning already governs `reportApiKeyHash` in `oauthRegistrations`.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Which scope a token claims to be, or null if it is not one of ours. */
export function scopeOf(token: string): ProxyScope | null {
  if (token.startsWith(PREFIXES.secret)) return "secret";
  if (token.startsWith(PREFIXES.publishable)) return "publishable";
  return null;
}
