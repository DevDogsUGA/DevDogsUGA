import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { refreshExpiringConnections } from "~/server/supabase/oauth";

/**
 * GET /cron/sandbox-refresh
 *
 * Refreshes Supabase OAuth grants before they lapse.
 *
 * Access tokens last 86,400s (measured), so a daily pass has ample margin — and
 * the margin matters, because a lapsed grant does not fail visibly. It makes
 * provisioning, pre-warm and the reconcile all quietly skip that owner's
 * environments until somebody notices their instance never woke up.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
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

  try {
    return NextResponse.json({
      success: true,
      ...(await refreshExpiringConnections()),
    });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
