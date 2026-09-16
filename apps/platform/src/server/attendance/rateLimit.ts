import { getCloudflareContext } from "@opennextjs/cloudflare";
import { env } from "~/env";

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Consume one rotating-code validation attempt. */
export async function allowAttendanceAttempt(key: string): Promise<boolean> {
  let binding: RateLimitBinding | undefined;
  try {
    const { env: workerEnv } = getCloudflareContext();
    binding = (workerEnv as { ATTENDANCE_RATE_LIMITER?: RateLimitBinding })
      .ATTENDANCE_RATE_LIMITER;
  } catch {
    // Node tests and `next dev` do not have a Worker request context.
    return true;
  }

  if (!binding) {
    if (env.DEPLOY_ENV === "development") return true;
    throw new Error(
      "The platform Worker has no attendance rate-limit binding.",
    );
  }

  return (await binding.limit({ key })).success;
}
