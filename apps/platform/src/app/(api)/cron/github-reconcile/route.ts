import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { postAlert } from "~/server/alerts";
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
 * The three passes run one after the other rather than concurrently --
 * `reconcileEntries` reads `competitions`, so it must not race
 * `reconcileCompetitions`'s writes to that table. Each pass runs in its own
 * try/catch: an exception escaping one (a systemic failure outside its own
 * per-item handling) is reported to Sentry and turned into `{ error }` in
 * that pass's slot below, so it costs none of the other two their own
 * report.
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

  const teams = await runPass("reconcileTeams", () => reconcileTeams());
  const competitions = await runPass("reconcileCompetitions", () =>
    reconcileCompetitions(),
  );
  const entries = await runPass("reconcileEntries", () => reconcileEntries(db));
  return NextResponse.json({ teams, competitions, entries });
}

async function runPass<T>(
  label: string,
  pass: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await pass();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await postAlert(`${label} failed outside its own per-item handling`, [
      message,
    ]);
    return { error: message };
  }
}
