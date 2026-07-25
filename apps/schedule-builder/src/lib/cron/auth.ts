import { type NextRequest } from "next/server";
import { env } from "~/env";

/** Returns 401 Response if the request is missing the correct cron secret, null otherwise. */
export function verifyCronSecret(req: NextRequest): Response | null {
  const auth = req.headers.get("authorization");
  if (env.NODE_ENV !== "development" && auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
