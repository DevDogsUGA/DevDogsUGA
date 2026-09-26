import { db } from "~/server/db";
import type { oauthDeviceCodes } from "~/server/db/schema";
import { hashUserCode } from "~/server/oauth/deviceCodes";
import { consumeRateLimit } from "~/server/rateLimit";

const RATE_LIMIT_SCOPE = "oauth:device:verify";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export type DeviceCodeRow = typeof oauthDeviceCodes.$inferSelect;

export type VerifyDeviceUserCodeResult =
  | { outcome: "rate_limited" }
  | { outcome: "not_found" }
  | { outcome: "found"; row: DeviceCodeRow };

/**
 * The verification page's lookup, split out of `~/app/(site)/tools/oauth/
 * device/page.tsx` so it is plain server code instead of render logic --
 * the page is a React Server Component, and this reads the clock
 * (`row.expiresAt.getTime() < Date.now()`) and writes to the rate-limit
 * table, both of which the repo's react-hooks lint forbids inside a
 * component body (`react-hooks/purity`; components must stay idempotent).
 * It also makes the lookup and its rate limit directly testable without a
 * full RSC render.
 *
 * Every render of the page with a `user_code` is a submission attempt --
 * brute-forcing the 20^8 code space one guess per page load is exactly what
 * `RATE_LIMIT_SCOPE` stops.
 */
export async function verifyDeviceUserCode(options: {
  normalizedUserCode: string;
  userId: string;
}): Promise<VerifyDeviceUserCodeResult> {
  const allowed = await consumeRateLimit({
    scope: RATE_LIMIT_SCOPE,
    subjectId: options.userId,
    limit: RATE_LIMIT_MAX_ATTEMPTS,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!allowed) return { outcome: "rate_limited" };

  const row = await db.query.oauthDeviceCodes.findFirst({
    where: { userCodeHash: hashUserCode(options.normalizedUserCode) },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return { outcome: "not_found" };
  }

  return { outcome: "found", row };
}
