import { type NextRequest } from "next/server";
import { applySecurityHeaders } from "@devdogsuga/security-headers";
import { updateSession } from "~/supabase/proxy";
import { env } from "~/env";

// Uses the legacy `middleware.ts` convention rather than Next 16's `proxy.ts`
// because proxy.ts runs only on the Node.js runtime, which the OpenNext
// Cloudflare adapter does not support. middleware.ts runs on the Edge runtime,
// and the session refresh only uses edge-safe APIs (@supabase/ssr).
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  // Authoritative header application -- see @devdogsuga/security-headers'
  // `applySecurityHeaders` doc comment for why this, not just next.config.ts's
  // `headers()`: that mechanism drops these headers on `/` specifically
  // (reproduced against a real `vinext build` + `wrangler dev` serve),
  // apparently because `/` is the one route with no `Set-Cookie` on its
  // response and so routes through vinext's CDN/cache response-stage
  // reconciliation instead of the plain per-request header merge every
  // cookied route gets. Middleware-set headers go through a separate,
  // earlier merge that survives that reconciliation. next.config.ts's
  // `headers()` stays wired too -- vinext skips re-setting a header
  // middleware already set, so this is not a duplicate -- as a fallback for
  // routes outside this middleware's matcher (static assets, images).
  applySecurityHeaders(response.headers, {
    environment: env.DEPLOY_ENV,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
    sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
