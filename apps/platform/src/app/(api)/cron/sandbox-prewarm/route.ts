import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { prewarmPass } from "~/server/supabase/provision";

/**
 * GET /cron/sandbox-prewarm
 *
 * Wakes environments with a competition starting inside fifteen minutes.
 *
 * Five-minute cadence against a measured 196-second restore: the lead time has
 * to cover both the restore and a cron tick landing badly, and fifteen minutes
 * is the floor that leaves room for both.
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
    return NextResponse.json({ success: true, ...(await prewarmPass()) });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
