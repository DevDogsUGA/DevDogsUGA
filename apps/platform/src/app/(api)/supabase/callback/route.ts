import { cookies } from "next/headers";
import { redirect, unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { expectSession } from "~/server/auth";
import {
  accessTokenFor,
  connectSupabase,
  probeScopes,
} from "~/server/supabase/oauth";
import { STATE_COOKIE, VERIFIER_COOKIE } from "../authorize/route";

/**
 * GET /api/supabase/callback
 *
 * Completes the Supabase OAuth flow and stores the grant in Vault.
 */
export async function GET(request: Request) {
  await connection();

  const userId = await expectSession().catch(() => null);
  if (!userId) unauthorized();

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const stored = jar.get(STATE_COOKIE)?.value;
  const verifier = jar.get(VERIFIER_COOKIE)?.value;

  // Single-use, and cleared before anything can fail: a verifier left behind
  // after a failed attempt is one an attacker gets a second chance at.
  jar.delete(STATE_COOKIE);
  jar.delete(VERIFIER_COOKIE);

  if (error) {
    // The member declining is a normal outcome, not an error page.
    redirect(`/console/sandbox?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !stored || !verifier) {
    return NextResponse.json(
      { code: "invalid_callback", message: "Missing code, state or verifier." },
      { status: 400 },
    );
  }

  const [expectedState, orgSlug] = stored.split(":");

  // Constant-time-ish: these are equal-length base64url strings from our own
  // CSPRNG, so a length check plus a comparison is not leaking anything an
  // attacker can use, but the comparison must happen before the exchange.
  if (state !== expectedState) {
    return NextResponse.json(
      { code: "state_mismatch", message: "This flow did not start here." },
      { status: 400 },
    );
  }

  try {
    await connectSupabase(userId, code, verifier, orgSlug ?? "");
  } catch (e) {
    console.error("[supabase-oauth] callback failed:", e);
    redirect("/console/sandbox?error=exchange_failed");
  }

  // The token response carries no `scope` field, so what was actually granted
  // can only be discovered by calling something. Probing here means a missing
  // scope surfaces on the connect screen rather than mid-provision, in front of
  // a team.
  const granted = await probeScopes(await accessTokenFor(userId));

  redirect(
    granted ? "/console/sandbox?connected=1" : "/console/sandbox?error=scopes",
  );
}
