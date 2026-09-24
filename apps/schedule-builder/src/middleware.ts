import { type NextRequest } from "next/server";
import { applySecurityHeaders } from "@devdogsuga/security-headers";
import { updateSession } from "~/supabase/middleware";
import { env } from "~/env";

const PUBLIC_PATHS = [
  "/",
  "/auth/callback",
  "/courses",
  "/plans",
  "/generate-schedule",
  "/manual-entry",
  "/questionnaire",
  "/past-credits",
  "/credit-data",
  "/settings",
  "/survey",
  "/route-map",
  "/distance-page",
];

// Authoritative header application -- see @devdogsuga/security-headers'
// `applySecurityHeaders` doc comment for why middleware, not just
// next.config.ts's `headers()`: that mechanism drops these headers on `/`
// specifically (reproduced against a real `vinext build` + `wrangler dev`
// serve), apparently because `/` is the one route with no `Set-Cookie` on its
// response and so routes through vinext's CDN/cache response-stage
// reconciliation instead of the plain per-request header merge every cookied
// route gets. Middleware-set headers go through a separate, earlier merge
// that survives that reconciliation. next.config.ts's `headers()` stays wired
// too -- vinext skips re-setting a header middleware already set, so this is
// not a duplicate -- as a fallback for routes outside this middleware's
// matcher (static assets, images).
function withSecurityHeaders(response: Response): Response {
  // `Response.redirect()` (the `!user && !isPublic` branch below) returns a
  // Response whose `headers` guard is spec-"immutable" -- `.set()` on it
  // throws `TypeError: immutable`. Re-wrapping in `new Response(body, init)`
  // always yields a mutable copy, cheaply, whether or not the input needed
  // it (a `NextResponse.next()`'s headers were already mutable).
  const mutable = new Response(response.body, response);
  applySecurityHeaders(mutable.headers, {
    environment: env.DEPLOY_ENV,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
    sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
  });
  return mutable;
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.searchParams.set("next", pathname);
    return withSecurityHeaders(Response.redirect(loginUrl));
  }

  return withSecurityHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
