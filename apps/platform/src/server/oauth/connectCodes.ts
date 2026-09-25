import { createHash, randomBytes } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthConnectCodes } from "~/server/db/schema";

/**
 * Crypto and lifecycle helpers for the `devtools oauth` connect handoff
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

/**
 * Deletes every `oauthConnectCodes` row past its `expiresAt`, across every
 * user. The row itself normally disappears when the exchange claims it
 * (`route.ts`'s delete-then-validate) -- this is for the one case that
 * doesn't happen at all: a code that gets approved (so a real client secret
 * is already sitting in the row) and then never exchanged, because the CLI
 * died, the user closed the tab, or the loopback redirect just never landed.
 * Nothing else ever touches an unconsumed row, so without this sweep an
 * abandoned one would hold a plaintext secret indefinitely.
 *
 * Called opportunistically from both halves of the handoff -- `approveConnect`
 * before it inserts a new row, and the exchange route after it claims one --
 * rather than run on a schedule. Rows live ~2 minutes and there are at most a
 * handful in flight at once, so "whichever request happens to run next
 * cleans up" is cheap enough that a cron job would be pure ceremony.
 */
export async function sweepExpiredConnectCodes(): Promise<void> {
  await db
    .delete(oauthConnectCodes)
    .where(lt(oauthConnectCodes.expiresAt, sql`now()`));
}
