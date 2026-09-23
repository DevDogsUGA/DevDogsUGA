import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { reconcileCompetitions } from "~/server/github/competitions";
import { reconcileEntries } from "~/server/github/pullRequest";
import { reconcileTeams } from "~/server/github/teamSync";

/**
 * GET /cron/github-reconcile
 *
 * Repairs `teams`/`teamMembers`, `competitions` and `competitionEntries`
 * against GitHub. Nightly.
 *
 * A backstop, not the mechanism: membership writes go GitHub-first at the
 * moment they happen, and the webhook route (`server/github/webhookEvents.ts`,
 * `server/github/competitionEvents.ts`, `server/github/prEvent.ts`) mirrors
 * most GitHub-side changes in near-real time. This exists for what neither
 * reaches -- a failed or undelivered webhook, or a change made directly on
 * GitHub the platform was never told about -- and it repairs the mirror
 * TOWARD GitHub, never the other way; see `reconcileTeams`'s,
 * `reconcileCompetitions`'s and `reconcileEntries`'s own doc comments for
 * why.
 *
 * Nightly rather than more often: if this pass is doing meaningful work
 * regularly, something upstream is broken and the cadence is hiding it.
 *
 * The three passes are independent and run one after the other rather than
 * concurrently -- `reconcileEntries` reads `competitions` but writes only
 * `competitionEntries`, so none of the three can cost another its own
 * report by failing.
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
  const entries = await reconcileEntries(db);
  return NextResponse.json({ teams, competitions, entries });
}
