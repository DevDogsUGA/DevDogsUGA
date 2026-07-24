import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import syncLeaderboard from "~/server/github/syncLeaderboard";

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
    await syncLeaderboard();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
