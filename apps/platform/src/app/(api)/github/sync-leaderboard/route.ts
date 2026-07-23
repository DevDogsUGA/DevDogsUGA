import { unauthorized } from "next/navigation";
import { NextResponse } from "next/server";
import { env } from "~/env";
import syncLeaderboard from "~/server/github/syncLeaderboard";

export async function GET(request: Request) {
  if (
    process.env.VERCEL_ENV &&
    process.env.VERCEL_ENV !== "development" &&
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
