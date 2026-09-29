import { buildContentSecurityPolicy, type CspInput } from "./csp.js";

/** The subset of `DeployEnvironment` (`@devdogsuga/env`) this builder needs. */
export type Environment = "development" | "staging" | "production";

export interface SecurityHeadersInput extends CspInput {
  /**
   * Which deployment this is. Only used to gate `Strict-Transport-Security`
   * -- HSTS asserts "always use HTTPS for this host," which is both false
   * and actively harmful for local dev (`vinext dev` serves plain HTTP
   * unless a local mkcert pair exists -- see `apps/platform/vite.config.ts`)
   * a browser that believed the assertion would refuse the plain-HTTP
   * connection outright.
   */
  environment: Environment;
}

/**
 * The header the CSP travels in. Report-Only for now; switching this to
 * `Content-Security-Policy` is the one-line change that enforces the policy
 * everywhere, the platform's edge-nonce path included.
 */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

/** One header, in the `{ key, value }` shape Next's `headers()` expects. */
export interface HeaderEntry {
  key: string;
  value: string;
}

/**
 * The full set of security response headers every app in the workspace
 * sends, built from env-derived inputs so the CSP/connect-src allowlist
 * can't drift between `apps/platform` and `apps/schedule-builder`.
 *
 * Callers wire this into `next.config.ts`:
 *
 * ```ts
 * import { buildSecurityHeaders } from "@devdogsuga/security-headers";
 *
 * async headers() {
 *   return [
 *     {
 *       source: "/:path*",
 *       headers: buildSecurityHeaders({
 *         environment: env.DEPLOY_ENV,
 *         supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
 *         sentryDsn: env.NEXT_PUBLIC_PLATFORM_SENTRY_DSN,
 *       }),
 *     },
 *   ];
 * }
 * ```
 *
 No `nonce` above: the static `headers()` fallback can never mint a real
 * per-request one (see `applySecurityHeaders`'s doc comment for why
 * `headers()` is a fallback for non-middleware routes only, not the
 * authoritative path). Those routes are exactly the ones with no inline
 * script to nonce (`_next/static`, `_next/image`, favicons, image
 * extensions).
 */
export function buildSecurityHeaders(
  input: SecurityHeadersInput,
): HeaderEntry[] {
  const headers: HeaderEntry[] = [];

  if (input.environment !== "development") {
    // No `preload`, deliberately: submitting to the HSTS preload list is a
    // one-way door (browsers ship it baked into the browser itself, and
    // getting a host removed takes months), not something to opt into as a
    // side effect of a headers PR.
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  headers.push(
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Deny every sensor/capability the workspace's apps don't use. Neither
    // app calls `getUserMedia`/`BarcodeDetector`/any QR-scanning API --
    // `apps/platform`'s attendance check-in is a code a member types or
    // opens via their phone's own camera app scanning a QR code the app
    // *displays* (`QrGenerator.tsx` renders it; nothing in the app reads
    // the browser camera) -- so `camera=()` denies outright rather than
    // `camera=(self)`.
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "gyroscope=()",
        "accelerometer=()",
        "interest-cohort=()",
      ].join(", "),
    },
    // CSP's `frame-ancestors 'none'` (below) is the modern equivalent; this
    // header is kept alongside it for the handful of older browsers/crawlers
    // that only honor `X-Frame-Options`.
    { key: "X-Frame-Options", value: "DENY" },
    { key: CSP_HEADER, value: buildContentSecurityPolicy(input) },
  );

  return headers;
}

/**
 * Sets every header from {@link buildSecurityHeaders} directly onto a `Headers`
 * instance (mutates in place, returns it for chaining) -- the shape
 * `NextResponse.headers` (and the Fetch API's `Headers`) exposes.
 *
 * Callers wire this into `middleware.ts`, the mechanism this workspace
 * settled on as authoritative (see the package README's "Why middleware, not
 * just `headers()`" section): `next.config.ts` `headers()` is applied at a
 * response-composition stage that a to-be-filed vinext issue drops for the
 * app's `/` route specifically (reproduced against a real `vinext build` +
 * `wrangler dev` serve, every other route unaffected) -- almost certainly
 * because `/` is the one route with no `Set-Cookie` on its response, which
 * routes it through vinext's CDN/cache-adapter response-stage reconciliation
 * instead of the plain per-request merge every cookied route gets.
 * Middleware-set headers go through a separate, earlier merge
 * (`applyMiddlewareContextToResponse` in vinext's `app-rsc-handler.js`) that
 * is NOT subject to that reconciliation, so they survive on `/` too.
 *
 * `next.config.ts` `headers()` stays wired as a second, harmless layer: vinext
 * explicitly skips re-setting a header middleware already set (see
 * `applyConfigHeadersToResponse`'s `middlewareHeaders?.has(name)` check in
 * `config-headers.js`), so there is no duplication or conflict -- it only
 * fills in routes middleware's matcher excludes (`_next/static`,
 * `_next/image`, favicons, image extensions).
 *
 * ```ts
 * import { applySecurityHeaders } from "@devdogsuga/security-headers";
 *
 * export async function middleware(request: NextRequest) {
 *   const response = await updateSession(request);
 *   applySecurityHeaders(response.headers, {
 *     environment: env.DEPLOY_ENV,
 *     supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
 *     sentryDsn: env.NEXT_PUBLIC_PLATFORM_SENTRY_DSN,
 *   });
 *   return response;
 * }
 * ```
 */
export function applySecurityHeaders(
  headers: Headers,
  input: SecurityHeadersInput,
): Headers {
  for (const { key, value } of buildSecurityHeaders(input)) {
    headers.set(key, value);
  }
  return headers;
}

export { buildContentSecurityPolicy, type CspInput } from "./csp.js";
