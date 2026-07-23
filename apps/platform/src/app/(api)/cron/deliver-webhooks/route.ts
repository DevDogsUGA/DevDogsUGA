import { unauthorized } from "next/navigation";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { verifyPendingReports } from "~/server/reports/verify";
import { retryPendingWebhooks } from "~/server/reports/webhook";

/**
 * GET /api/cron/deliver-webhooks
 *
 * 1. Delivers report.verify webhooks for unverified reports.
 * 2. Retries report.resolved webhook deliveries that previously failed.
 *
 * Should be invoked by a Vercel Cron job every minute: `"* * * * *"`.
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as sync-leaderboard).
 * The check is skipped when running locally (no VERCEL_ENV set).
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
    await verifyPendingReports();
    await retryPendingWebhooks();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
