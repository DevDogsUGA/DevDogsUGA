import { createServerClient } from "@devdogsuga/db/client";
import type { Database } from "@devdogsuga/supabase";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";
import { isSessionCookieName } from "./sessionCookie";

/**
 * Whether the request carries a Supabase session at all. A signed-out visitor
 * who merely reached the sign-in redirect carries a PKCE verifier cookie,
 * which doesn't count; see `isSessionCookieName`.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => isSessionCookieName(name));
}

/**
 * Refreshes the Supabase session on every request that carries one.
 *
 * It writes any rotated tokens to the request, so Server Components see the
 * new session, and to the response, so the browser receives the updated
 * cookies. Without this, SSR refreshes an expired access token but cannot
 * write the rotated refresh token back from a Server Component, leaving the
 * cookie holding an already-invalidated refresh token and breaking the session
 * for every subsequent request.
 *
 * The request is forwarded (`NextResponse.next({ request })`) only when its
 * headers changed: when tokens rotated, or when the caller set one it needs
 * downstream (`forwardRequest`). vinext serves a page from the shared cache
 * only when middleware left the request alone, so forwarding it on every
 * request would make every page render fresh.
 */
export async function updateSession(
  request: NextRequest,
  { forwardRequest = false }: { forwardRequest?: boolean } = {},
) {
  const next = () =>
    forwardRequest ? NextResponse.next({ request }) : NextResponse.next();

  // A signed-out visitor has no session to refresh, so skip the auth call
  // entirely. This matters because the matcher covers every HTML, RSC and
  // prefetch request: without it, each hit on a fully static marketing page,
  // which needs no server render at all, still paid for a getClaims() round
  // trip before the CDN could answer.
  if (!hasSessionCookie(request)) return next();

  let response = next();

  const supabase = createServerClient<Database, typeof APP_SCHEMA>({
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
