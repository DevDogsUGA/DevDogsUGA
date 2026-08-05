import { cookies } from "next/headers";
import { redirect, unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { expectSession } from "~/server/auth";
import { authorizeUrl, isConfigured } from "~/server/supabase/oauth";

/**
 * GET /supabase/authorize
 *
 * Starts the Supabase OAuth flow for the signed-in member.
 *
 * PKCE, even though this is a confidential client holding a secret. The
 * authorization code travels through the member's browser, and a verifier binds
 * the code to the session that started the flow — so a code intercepted in
 * transit or replayed from a stale redirect is useless without the cookie.
 */
export const STATE_COOKIE = "sb_oauth_state";
export const VERIFIER_COOKIE = "sb_oauth_verifier";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function GET(request: Request) {
  await connection();

  const userId = await expectSession().catch(() => null);
  if (!userId) unauthorized();

  if (!isConfigured()) {
    return NextResponse.json(
      {
        code: "not_configured",
        message:
          "Supabase OAuth is not configured. SUPABASE_OAUTH_CLIENT_ID and SUPABASE_OAUTH_CLIENT_SECRET must be set.",
      },
      { status: 503 },
    );
  }

  const orgSlug = new URL(request.url).searchParams.get("org") ?? "";

  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );

  const jar = await cookies();
  // httpOnly so no script can read the verifier; sameSite lax because the
  // callback arrives as a top-level navigation from Supabase, which `strict`
  // would strip the cookie from -- breaking every flow.
  const options = {
    httpOnly: true,
    secure: process.env.DEPLOY_ENV !== undefined,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  jar.set(STATE_COOKIE, `${state}:${orgSlug}`, options);
  jar.set(VERIFIER_COOKIE, verifier, options);

  redirect(authorizeUrl(state, challenge));
}
