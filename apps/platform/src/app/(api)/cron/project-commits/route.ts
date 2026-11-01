import { connection, NextResponse } from "next/server";
import { authorizeCron } from "~/server/moderation/cronAuth";
import { runCommitSync } from "~/server/github/sync";

/**
 * GET /cron/project-commits
 *
 * The commit sync (`~/server/github/sync`): default-branch commits by DevDogs
 * members from the public DevDogsUGA repos and every approved linked repo, and
 * the backfill of members who just linked GitHub. One invocation spends at
 * most 100 GitHub requests or 45 seconds.
 *
 * Two callers, one route. The daily cron (05:10 UTC) starts a cycle. The
 * fifteen-minute dispatcher calls it with `?continue=1` to resume a cycle in
 * progress, or a backfill, and it starts nothing when there is none. The
 * cycle's completion writes the `platform-commit-sync` heartbeat, which
 * `/cron/heartbeats` checks.
 *
 * The response is a 500 only for an authentication or permission failure with
 * GitHub (the read App is misconfigured or uninstalled). A rate limit or a
 * transient failure answers 200 and is retried by the next continuation.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
 */
export async function GET(request: Request) {
  await connection();
  authorizeCron(request);
  const run = await runCommitSync(
    new URL(request.url).searchParams.get("continue") !== "1",
  );
  return NextResponse.json(run, { status: run.success ? 200 : 500 });
}
