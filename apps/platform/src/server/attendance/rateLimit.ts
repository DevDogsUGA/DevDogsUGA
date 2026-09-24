import { env as workerEnv } from "cloudflare:workers";
import { env } from "~/env";

/**
 * A sub-minute burst limiter, backed by the Workers Rate Limiting binding.
 * For anything needing a window over 60 seconds (the binding's `simple`
 * mode only accepts a `period` of 10 or 60), see `~/server/rateLimit.ts`'s
 * `consumeRateLimit` instead -- that is this idea generalized, not a second
 * mechanism.
 */
/** Consume one rotating-code validation attempt. */
export async function allowAttendanceAttempt(key: string): Promise<boolean> {
  const binding = workerEnv.ATTENDANCE_RATE_LIMITER;

  if (!binding) {
    if (env.DEPLOY_ENV === "development") return true;
    throw new Error(
      "The platform Worker has no attendance rate-limit binding.",
    );
  }

  return (await binding.limit({ key })).success;
}
