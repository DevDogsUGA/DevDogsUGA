import { NextResponse, connection } from "next/server";
import { CliAuthError, resolveTeamTarget } from "~/server/sandbox/cliAuth";
import { restoreEnvironment } from "~/server/supabase/provision";

/**
 * POST /sandbox/status
 *
 * Reports an environment's state, and wakes it if it is paused.
 *
 * Waking on a status check rather than making people ask separately: somebody
 * running `pnpm sb status` at the start of a session wants to work, and a
 * command that reports "paused" and stops has made them wait for a restore they
 * then have to trigger by hand.
 */
export async function POST(request: Request) {
  await connection();

  try {
    const { slug } = (await request.json()) as { slug?: string };
    if (!slug) {
      return NextResponse.json({ code: "bad_request" }, { status: 400 });
    }

    const target = await resolveTeamTarget(request, slug);

    if (target.status === "paused") {
      await restoreEnvironment(target.environmentId);
      return NextResponse.json({
        status: "restoring",
        waking: true,
        // 196s measured, rounded up. A token 30 seconds would train people to
        // retry into a wall.
        etaSeconds: 240,
      });
    }

    return NextResponse.json({
      status: target.status,
      waking: target.status === "restoring" || target.status === "provisioning",
      etaSeconds: target.status === "restoring" ? 240 : undefined,
    });
  } catch (error) {
    if (error instanceof CliAuthError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    console.error("[sandbox] status failed:", error);
    return NextResponse.json({ code: "unknown" }, { status: 500 });
  }
}
