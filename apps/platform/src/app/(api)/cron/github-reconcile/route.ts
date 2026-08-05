import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { reconcileTeams } from "~/server/github/teamSync";

/**
 * GET /cron/github-reconcile
 *
 * Repairs GitHub team membership against `teamMembers`. Nightly.
 *
 * A backstop, not the mechanism. Every membership change already fires on the
 * platform event that caused it — a member who joins on Tuesday can push on
 * Tuesday, and running that through a schedule would make it a nightly
 * promise. This exists because GitHub's API can fail and a membership change
 * that silently did not apply is invisible until somebody cannot push.
 *
 * Nightly rather than more often for the same reason: if this pass is doing
 * meaningful work regularly, something upstream is broken and the cadence is
 * hiding it.
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
