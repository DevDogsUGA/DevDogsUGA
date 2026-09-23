import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { reconcileCompetitions } from "~/server/github/competitions";
import { reconcileTeams } from "~/server/github/teamSync";

/**
 * GET /cron/github-reconcile
 *
 * Repairs `teams`/`teamMembers` and `competitions` against GitHub. Nightly.
 *
 * A backstop, not the mechanism: membership writes go GitHub-first at the
 * moment they happen, and the webhook route (`server/github/webhookEvents.ts`,
 * `server/github/competitionEvents.ts`) mirrors most GitHub-side changes in
 * near-real time. This exists for what neither reaches -- a failed or
 * undelivered webhook, or a change made directly on GitHub the platform was
 * never told about -- and it repairs the mirror TOWARD GitHub, never the
 * other way; see `reconcileTeams`'s and `reconcileCompetitions`'s own doc
 * comments for why.
 *
 * Nightly rather than more often: if this pass is doing meaningful work
 * regularly, something upstream is broken and the cadence is hiding it.
 *
 * The two passes are independent and run one after the other rather than
 * concurrently -- neither reads the other's tables, and a competitions
 * failure should not cost the teams pass its own report, or the reverse.
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

  const teams = await reconcileTeams();
  const competitions = await reconcileCompetitions();
  return NextResponse.json({ teams, competitions });
}
