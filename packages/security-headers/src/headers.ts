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
 *         sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
 *       }),
 *     },
 *   ];
 * }
 * ```
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
    {
      key: "Content-Security-Policy-Report-Only",
      value: buildContentSecurityPolicy(input),
    },
  );

  return headers;
}

export { buildContentSecurityPolicy, type CspInput } from "./csp.js";
