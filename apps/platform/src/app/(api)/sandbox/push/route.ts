import { NextResponse, connection } from "next/server";
import { CliAuthError, resolveTeamTarget } from "~/server/sandbox/cliAuth";
import { applyMigrations } from "~/server/supabase/provision";

/**
 * POST /api/sandbox/push
 *
 * Applies the repo's migrations to a team's environment.
 *
 * **Every member gets full DDL, not just the lead.** The environment is a
 * sandbox; the thing being protected is the platform's data, not the team's
 * test rows. Requiring the lead for migrations would make them a bottleneck on
 * the single most common action of an event weekend.
 *
 * Runs under the OWNER's OAuth token regardless of who called, which is what
 * makes that safe: the caller never holds a credential, and the platform is the
 * only thing that can reach the Management API.
 */
export async function POST(request: Request) {
  await connection();

  try {
    const { slug } = (await request.json()) as { slug?: string };
    if (!slug) {
      return NextResponse.json({ code: "bad_request" }, { status: 400 });
    }

    const target = await resolveTeamTarget(request, slug);
    await applyMigrations(target.environmentId);

    return NextResponse.json({ ok: true, applied: 1 });
  } catch (error) {
    if (error instanceof CliAuthError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    console.error("[sandbox] push failed:", error);
    return NextResponse.json(
      {
        code: "push_failed",
        // `database/query` is atomic (measured), so a failed migration leaves
        // the schema untouched rather than half-applied. Worth saying, because
        // the instinct after a failure is to start repairing by hand.
        message:
          "Migrations were not applied. The schema is unchanged — the whole payload rolls back on any error.",
      },
      { status: 500 },
    );
  }
}
