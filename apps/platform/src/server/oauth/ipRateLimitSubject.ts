import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * `consumeRateLimit`'s `subjectId` is cast to `::uuid` everywhere else it is
 * called (a real user or team id). The unauthenticated `devtools oauth`
 * endpoints -- the loopback connect exchange and both device-code endpoints
 * -- have no identity to key on until after the request has already done the
 * thing being rate-limited (looked up a code, minted a client), so this
 * folds the caller's IP into the same column shape instead of adding a
 * second limiter mechanism.
 */
export function ipRateLimitSubject(request: NextRequest): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip = request.headers.get("cf-connecting-ip") ?? forwarded ?? "unknown";
  const digest = createHash("sha256").update(ip).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}
