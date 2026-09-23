import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { reconcileTeams } from "~/server/github/teamSync";

/**
 * GET /cron/github-reconcile
 *
 * Repairs `teams`/`teamMembers` against GitHub. Nightly.
 *
 * A backstop, not the mechanism: membership writes go GitHub-first at the
 * moment they happen, and the webhook route
 * (`server/github/webhookEvents.ts`) mirrors most GitHub-side changes in
 * near-real time. This exists for what neither reaches -- a failed or
 * undelivered webhook, or a change made directly on GitHub the platform was
 * never told about -- and it repairs the mirror TOWARD GitHub, never the
 * other way; see `reconcileTeams`'s own doc comment for why.
 *
 * Nightly rather than more often: if this pass is doing meaningful work
 * regularly, something upstream is broken and the cadence is hiding it.
 */
export async function GET(request: Request) {
  await connection();

  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }

  const report = await reconcileTeams();
  return NextResponse.json(report);
}
