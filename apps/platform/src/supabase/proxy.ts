import { createServerClient } from "@devdogsuga/sb";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

/**
 * Whether the request carries a Supabase session at all.
 *
 * `@supabase/ssr` names its session cookie `sb-<project-ref>-auth-token`, and
 * splits it into `.0`/`.1` parts when the value outgrows a single cookie — so
 * match on the shape rather than an exact name.
 *
 * The PKCE verifier written when an OAuth flow *starts* is named
 * `sb-<project-ref>-auth-token-code-verifier`, which fits that shape without
 * being a session. Excluding it matters: a signed-out visitor who merely
 * reached the sign-in redirect would otherwise carry it for the rest of the
 * browsing session and pay a `getClaims()` round trip on every request —
 * exactly the cost the early return below exists to avoid.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      ({ name }) =>
        name.startsWith("sb-") &&
        name.includes("auth-token") &&
        !name.endsWith("-code-verifier"),
    );
}

/**
 * Refreshes the Supabase session on every request that carries one and persists any rotated
 * tokens to the request (so Server Components see the new session) and the
 * response (so the browser receives the updated cookies). Without this,
 * expired access tokens get refreshed during SSR but the rotated refresh
 * token can't be written back from a Server Component, leaving the cookie
 * holding an already-invalidated refresh token and breaking the session for
 * every subsequent request.
 */
export async function updateSession(request: NextRequest) {
  // A signed-out visitor has no session to refresh, so skip the auth call
  // entirely. This matters because the matcher covers every HTML, RSC and
  // prefetch request: without it, each hit on a fully static marketing page —
  // which needs no server render at all — still paid for a getClaims() round
  // trip before the CDN could answer.
  if (!hasSessionCookie(request)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient({
    url: env.API_URL,
    key: env.PUBLISHABLE_KEY,
    schema: APP_SCHEMA,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}
