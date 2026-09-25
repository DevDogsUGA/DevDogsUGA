import { type NextRequest } from "next/server";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
} from "@devdogsuga/security-headers";
import { updateSession } from "~/supabase/proxy";
import { env } from "~/env";

// Uses the legacy `middleware.ts` convention rather than Next 16's `proxy.ts`
// because proxy.ts runs only on the Node.js runtime, which the OpenNext
// Cloudflare adapter does not support. middleware.ts runs on the Edge runtime,
// and the session refresh only uses edge-safe APIs (@supabase/ssr).
export async function middleware(request: NextRequest) {
  // Minted once per request and written onto the *request* headers below --
  // see `@devdogsuga/security-headers`'s `csp.ts` file-level doc comment.
  // vinext (like Next) reads the nonce for scripts/styles it emits itself
  // (bootstrap module, __NEXT_DATA__, font preloads) off the request's
  // Content-Security-Policy(-Report-Only) header, not the response's.
  const nonce = generateNonce();
  const cspInput = {
    environment: env.DEPLOY_ENV,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
    sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
    nonce,
  };
  // Mutates the live Headers instance on `request` -- `updateSession` below
  // eventually calls `NextResponse.next({ request })`, which reads this same
  // instance and encodes it as the middleware request-header override vinext
  // decodes server-side (`applyMiddlewareRequestHeaders` in
  // vinext/dist/shims/headers.js) to rebuild the request `headers()` context
  // every downstream Server Component and the renderer itself observe.
  request.headers.set(
    "Content-Security-Policy-Report-Only",
    buildContentSecurityPolicy(cspInput),
  );
  // Plain carrier for `RootLayout`'s hand-written inline `<script>` tags
  // (`headers().get("x-nonce")`) -- vinext parses the nonce back out of the
  // CSP header above for its OWN emitted scripts, but there is no public API
  // to ask it for that same value from application code, so it travels
  // twice, once in each shape its two consumers need.
  request.headers.set("x-nonce", nonce);

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
  // routes outside this middleware's matcher (static assets, images), which
  // is exactly why that fallback path has no real nonce to carry (see its
  // doc comment).
  applySecurityHeaders(response.headers, cspInput);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
