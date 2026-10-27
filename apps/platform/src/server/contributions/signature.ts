import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Checks GitHub's `X-Hub-Signature-256` header (`sha256=<hex>`) against the raw
 * request body. The comparison is constant-time and a malformed header is just
 * "invalid", never an exception.
 *
 * The body must be the exact bytes GitHub sent: re-serialising parsed JSON
 * changes them.
 */
export function verifyGithubSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): boolean {
  if (!header) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(match[1]!, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The header value GitHub would send for `rawBody`. Tests and tooling only. */
export function signGithubBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}
