import { env as workerEnv } from "cloudflare:workers";
import { env } from "~/env";

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
