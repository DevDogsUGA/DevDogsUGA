import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { syncAcademicPrograms } from "~/server/academics/sync";

/**
 * GET /cron/academic-programs
 *
 * Refreshes the UGA Bulletin program catalog once a day. The scraper completes
 * and validates every rate-limited page before opening its database
 * transaction, so an upstream outage or markup change leaves the previous
 * catalog intact.
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
    const report = await syncAcademicPrograms();
    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    console.error("academic_program_sync_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Academic program sync failed." },
      { status: 500 },
    );
  }
}
