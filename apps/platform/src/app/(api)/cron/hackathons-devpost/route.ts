import { connection, NextResponse } from "next/server";
import { authorizeCron } from "~/server/moderation/cronAuth";
import { runDevpostSync } from "~/server/hackathons/sync";

/**
 * GET /cron/hackathons-devpost
 *
 * The Devpost sync (`~/server/hackathons/sync`): every online, open or
 * upcoming hackathon on Devpost's public feed, stored as an approved Hackathon.
 * One invocation reads at most twelve pages or 25 seconds.
 *
 * Two callers, one route. The daily cron (05:40 UTC) starts a cycle. The
 * fifteen-minute dispatcher calls it with `?continue=1` to resume a cycle in
 * progress or one backing off after a failure, and it starts nothing when
 * there is none. The cycle's completion writes the `platform-devpost-sync`
 * heartbeat, which `/cron/heartbeats` checks.
 *
 * The feed is undocumented, so the job fails softly: a bad page, a rate limit
 * or a changed schema keeps the last good data and answers 200, and the
 * heartbeat going overdue is what raises the alarm. Only a bad
 * `Authorization` header (a configuration error) is an error response.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
 */
export async function GET(request: Request) {
  await connection();
  authorizeCron(request);
  const run = await runDevpostSync(
    new URL(request.url).searchParams.get("continue") !== "1",
  );
  return NextResponse.json(run);
}
