import { sql } from "drizzle-orm";
import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { db } from "~/server/db";
import { env } from "~/env";

/**
 * GET /cron/keepalive
 *
 * Keeps the free-tier staging Supabase project from being paused.
 *
 * Supabase pauses a Free plan project that "does not receive sufficient user
 * database activity over the past week", and says "a few user requests to the
 * database each day over the previous week is enough to keep the project from
 * being paused." Staging deploys roughly weekly, which is exactly the cadence
 * that trips it.
 *
 * ⚠️ This PREVENTS pausing. It cannot cure it — a query against a paused
 * project fails, and restoring is a dashboard action (there is no documented
 * Management API restore, and a Management API token would carry full account
 * privileges across BOTH Supabase organizations, which is precisely what the
 * staging tier must not hold). So the failure mode to care about is this route
 * silently not running: if a staging deploy breaks, the project pauses about a
 * week later. Cloudflare invocation logs are enabled for exactly this reason.
 *
 * Which environments run it is decided by the cron expression in
 * `wrangler.jsonc`, not by a check here: only `env.staging` lists this
 * schedule, so production never fires it. Running it by hand anywhere is
 * harmless.
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
    // A real table read rather than `select 1`. Supabase's threshold is worded
    // as "user database activity", and a query that touches no user table is
    // the one most likely to fall outside whatever they actually measure.
    // `platform.roles` is seeded with the member and root rows, so it is never
    // empty and this doubles as a check that the schema arrived.
    const [row] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from platform.roles`,
    );

    // Two queries, not one. The documented threshold is "a few user requests
    // each day"; at a six-hour cadence this leaves margin for a failed run
    // without depending on how Supabase counts.
    await db.execute(sql`select now()`);

    return NextResponse.json({ success: true, roles: row?.count ?? 0 });
  } catch (e) {
    // Logged rather than swallowed: this failing is the early warning that the
    // project is already paused, or about to be.
    console.error("keepalive failed", e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
