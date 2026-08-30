import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { runJudgingPass } from "~/server/teams/judgingPass";

/**
 * GET /cron/judging-start
 *
 * Freezes competition participation and creates solo teams for competitions
 * whose judging has begun. Every five minutes.
 *
 * No competition star is ever awarded without this pass: the star reads
 * `teams."competedAt"`, and nothing else writes that column.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, same as the other cron routes,
 * skipped when running locally.
 */
export async function GET(request: Request) {
  // Force request-time execution. Under Cache Components, Next would
  // otherwise prerender this handler at build time and run its database work
  // during the build.
  await connection();

  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }

  const report = await runJudgingPass();
  return NextResponse.json(report);
}
