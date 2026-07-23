import { unauthorized } from "next/navigation";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { reconcileMembership } from "~/server/discord/reconcile";

/**
 * GET /api/cron/sync-discord-roles
 *
 * Backstop for synced-role guild membership: additively grants/revokes
 * DevDogs roles to match Discord role membership for linked users. Role
 * name/color reconciliation runs on every Permissions page load instead, not
 * here — see `reconcileRoleDefinitions`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as
 * sync-leaderboard). The check is skipped when running locally (no
 * VERCEL_ENV set).
 */
export async function GET(request: Request) {
  if (
    process.env.VERCEL_ENV &&
    process.env.VERCEL_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }

  try {
    const result = await reconcileMembership();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
