import { type NextRequest } from "next/server";
import { applySecurityHeaders } from "@devdogsuga/sdk/headers";
import { platformSecurityHeaders } from "~/lib/securityHeaders";
import { updateSession } from "~/supabase/proxy";

export async function middleware(request: NextRequest) {
  // Middleware leaves the request alone wherever it can, because vinext serves
  // a page from the shared cache only when middleware changed no request
  // header. So there is no CSP nonce here: pages render without one and the
  // Worker entry stamps a fresh one onto every response at the edge
  // (`cloudflare/nonce.ts`).
  //
  // The console access-denied card receives no props, so it reads this
  // header to identify the refused section. Console pages are never cached.
  const wantsRequestPath = /^\/console(\/|$)/.test(request.nextUrl.pathname);
  if (wantsRequestPath) {
    request.headers.set(
      "x-request-path",
      request.nextUrl.pathname + request.nextUrl.search,
    );
  }

  const response = await updateSession(request, {
    forwardRequest: wantsRequestPath,
  });
  // Authoritative header application -- see @devdogsuga/sdk/headers'
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
  //
  // The CSP set here has no nonce. On an HTML response the Worker entry
  // replaces it with one that matches the nonce it stamps.
  applySecurityHeaders(response.headers, platformSecurityHeaders());
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
