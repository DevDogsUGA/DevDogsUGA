import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { runTally } from "~/server/elections/runTally";

/**
 * GET /api/cron/tally-elections
 *
 * Borda each election whose voting has closed, then finalize each competition
 * whose elections have all been tallied. Every five minutes.
 *
 * Separate from /api/cron/judging-start despite the shared cadence: this pass
 * blocks on ungraded competitions and on a missing tiebreak ballot, and
 * freezing participation has to happen whether or not grading is done.
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

  const report = await runTally();
  return NextResponse.json(report);
}
