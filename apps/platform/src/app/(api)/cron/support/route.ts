import { unauthorized } from "next/navigation";
import { NextResponse, connection, type NextRequest } from "next/server";
import { env } from "~/env";
import { supportConfig } from "~/server/support/config";
import { syncForumIndex } from "~/server/support/forumIndex";
import { ensureSupportCommands } from "~/server/support/interactions";
import { expireGuests } from "~/server/support/retention";

/**
 * GET /cron/support[?backfill=1]
 *
 * The docs support widget's upkeep, every fifteen minutes:
 *
 * - indexes #tech-support posts that moved since the last pass, including
 *   ones started in Discord rather than the widget, so suggestions cover the
 *   whole forum. `?backfill=1` also walks every archived post, the one-time
 *   launch import; it is safe to rerun.
 * - registers the officers' message commands if they are missing.
 * - deletes guests idle past the retention window.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, like every cron route.
 */
export async function GET(request: NextRequest) {
  await connection();

  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }

  const config = supportConfig();
  if (!config) return NextResponse.json({ success: true, skipped: true });

  try {
    const backfill = request.nextUrl.searchParams.get("backfill") === "1";
    const [index, commandsRegistered, guestsExpired] = await Promise.all([
      syncForumIndex(config, { backfill }),
      ensureSupportCommands(),
      expireGuests(),
    ]);
    return NextResponse.json({
      success: true,
      ...index,
      commandsRegistered,
      guestsExpired,
    });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
