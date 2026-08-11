import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { reconcileMembership } from "~/server/discord/reconcile";

/**
 * GET /cron/sync-discord-roles
 *
 * Backstop for synced-role guild membership: additively grants/revokes
 * DevDogs roles to match Discord role membership for linked users. Role
 * name/color reconciliation runs on every Permissions page load instead, not
 * here — see `reconcileRoleDefinitions`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, the same pattern as every other
 * cron route. The check is skipped when running locally (no DEPLOY_ENV set).
 */
export async function GET(request: Request) {
  // Force request-time execution. Under Cache Components, Next would
  // otherwise statically prerender this GET handler at build time and run its
  // external I/O during the build (fetch rejects once the prerender completes).
  // connection() marks the route dynamic, which is the correct behavior for a
  // cron endpoint that must run per-request.
  await connection();

  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
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
