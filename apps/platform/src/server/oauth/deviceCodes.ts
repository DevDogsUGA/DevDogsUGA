import { createHash, randomBytes } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthDeviceCodes } from "~/server/db/schema";

/**
 * Crypto and lifecycle helpers for the `devtools oauth` device-code handoff
 * (`POST /tools/oauth/device/code` → `GET /tools/oauth/device` →
 * `POST /tools/oauth/device/token`, migration 33's `oauthDeviceCodes`
 * table). RFC 8628 (OAuth 2.0 Device Authorization Grant), not the RFC 8252
 * loopback dance `~/server/oauth/connectCodes` implements -- kept in its own
 * module for the same reason that one is: both the issuing endpoint and the
 * verification/polling endpoints hash things the same way without importing
 * from each other.
 */

const DEVICE_CODE_BYTES = 32;

/** RFC 8628 §6.1's recommended alphabet: no `0/O`, `1/I/l`, no vowels. */
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const USER_CODE_LENGTH = 8;

/** A fresh, unguessable single-use device_code, and the hash that gets stored. */
export function generateDeviceCode(): { code: string; codeHash: string } {
  const code = randomBytes(DEVICE_CODE_BYTES).toString("base64url");
  return { code, codeHash: hashDeviceCode(code) };
}

/** sha256 of a device_code, hex-encoded -- what `deviceCodeHash` stores. */
export function hashDeviceCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * One unbiased character from `USER_CODE_ALPHABET`. Rejection sampling
 * instead of `byte % 20`: 256 is not a multiple of 20, so a naive modulo
 * would favor the alphabet's first 16 characters over its last 4.
 */
function randomAlphabetChar(): string {
  const maxAccepted = 256 - (256 % USER_CODE_ALPHABET.length); // 240 -- the largest multiple of 20 under 256
  let byte: number;
  do {
    byte = randomBytes(1)[0]!;
  } while (byte >= maxAccepted);
  return USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]!;
}

/** A fresh, unformatted (no dash) 8-character user_code. */
export function generateRawUserCode(): string {
  return Array.from({ length: USER_CODE_LENGTH }, randomAlphabetChar).join("");
}

/** sha256 of a normalized user_code, hex-encoded -- what `userCodeHash` stores. */
export function hashUserCode(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Normalizes user input for comparison against a stored `userCodeHash`:
 * uppercase, strip spaces and dashes (so `"abcd-efgh"`, `"ABCD EFGH"`, and
 * `"abcdefgh"` all resolve to the same code). Returns `null` if the result
 * is not exactly 8 characters from `USER_CODE_ALPHABET` -- callers treat
 * that the same as "code not found" rather than a separate format error, so
 * a guesser learns nothing from the distinction.
 */
export function normalizeUserCode(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[\s-]/g, "");
  if (stripped.length !== USER_CODE_LENGTH) return null;
  for (const char of stripped) {
    if (!USER_CODE_ALPHABET.includes(char)) return null;
  }
  return stripped;
}

/** `"ABCDEFGH"` → `"ABCD-EFGH"`, the wire format for `user_code`. */
export function formatUserCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/**
 * Deletes every `oauthDeviceCodes` row past its `expiresAt`, across every
 * user -- the device-code counterpart to `sweepExpiredConnectCodes`. A row
 * here can hold a plaintext client secret from the moment it is approved
 * until the CLI's next poll claims it, so an abandoned one (approved but
 * the CLI died or never came back, or never verified at all) would
 * otherwise sit here indefinitely. Called opportunistically from both
 * `POST /tools/oauth/device/code` (before it inserts a new row) and
 * `POST /tools/oauth/device/token` (on every poll) rather than on a
 * schedule, same reasoning as the connect flow's sweep.
 */
export async function sweepExpiredDeviceCodes(): Promise<void> {
  await db
    .delete(oauthDeviceCodes)
    .where(lt(oauthDeviceCodes.expiresAt, sql`now()`));
}
