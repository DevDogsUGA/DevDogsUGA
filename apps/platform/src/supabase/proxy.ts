import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "~/env";
import type { Database } from "./types";

/**
 * Refreshes the Supabase session on every request and persists any rotated
 * tokens to the request (so Server Components see the new session) and the
 * response (so the browser receives the updated cookies). Without this,
 * expired access tokens get refreshed during SSR but the rotated refresh
 * token can't be written back from a Server Component, leaving the cookie
 * holding an already-invalidated refresh token and breaking the session for
 * every subsequent request.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.API_URL,
    env.PUBLISHABLE_KEY,
    {
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
    },
  );

  await supabase.auth.getClaims();

  return response;
}
