import { type NextRequest } from "next/server";
import { applySecurityHeaders } from "@devdogsuga/security-headers";
import { platformSecurityHeaders } from "~/lib/securityHeaders";
import { updateSession } from "~/supabase/proxy";

// Uses the legacy `middleware.ts` convention rather than Next 16's `proxy.ts`
// because proxy.ts runs only on the Node.js runtime, which the OpenNext
// Cloudflare adapter does not support. middleware.ts runs on the Edge runtime,
// and the session refresh only uses edge-safe APIs (@supabase/ssr).
export async function middleware(request: NextRequest) {
  // Middleware leaves the request alone wherever it can, because vinext serves
  // a page from the shared cache only when middleware changed no request
  // header. So there is no CSP nonce here: pages render without one and the
  // Worker entry stamps a fresh one onto every response at the edge
  // (`cloudflare/nonce.ts`).
  //
  // The one header it does add is for `/tools`, which is signed-in only and
  // never cached. A layout (unlike a page) receives no `searchParams`, and
  // there is no public API to ask Next for the request it is rendering inside
  // of. `(site)/tools/layout.tsx` reads this to build a `callbackPath` that
  // survives a sign-in redirect with the query string intact (e.g.
  // `/tools/oauth/connect?redirect_uri=...`), rather than dropping straight to
  // a bare `/auth`. Setting it mutates the live Headers instance on `request`,
  // and `forwardRequest` makes `updateSession` pass it on as the middleware
  // request-header override vinext decodes server-side to rebuild the
  // `headers()` context.
  const isTools = /^\/tools(\/|$)/.test(request.nextUrl.pathname);
  if (isTools) {
    request.headers.set(
      "x-request-path",
      request.nextUrl.pathname + request.nextUrl.search,
    );
  }

  const response = await updateSession(request, { forwardRequest: isTools });
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
