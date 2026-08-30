import { NextResponse, connection } from "next/server";
import { CliAuthError, resolveTeamTarget } from "~/server/sandbox/cliAuth";
import { runQuery } from "~/server/supabase/managementApi";
import { accessTokenFor } from "~/server/supabase/oauth";
import { applyMigrations } from "~/server/supabase/provision";

/**
 * POST /sandbox/reset
 *
 * Drops the team's public schema and rebuilds it from migrations.
 *
 * Migrations live in git, so a reset restores the whole schema. Only test data
 * is lost, and test data is the only kind these instances are supposed to hold.
 */
export async function POST(request: Request) {
  await connection();

  try {
    const { slug } = (await request.json()) as { slug?: string };
    if (!slug) {
      return NextResponse.json({ code: "bad_request" }, { status: 400 });
    }

    const target = await resolveTeamTarget(request, slug);
    const token = await accessTokenFor(target.ownerUserId);

    // `public` only. Dropping `auth` would take the members' own sign-ins with
    // it, and those are federated against real DevDogs accounts. A reset must
    // cost test rows, not the ability to log in.
    await runQuery(
      token,
      target.projectRef,
      `drop schema if exists public cascade;
       create schema public;
       grant usage on schema public to anon, authenticated, service_role;
       grant all on schema public to postgres;`,
    );

    await applyMigrations(target.environmentId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CliAuthError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    console.error("[sandbox] reset failed:", error);
    return NextResponse.json({ code: "reset_failed" }, { status: 500 });
  }
}
