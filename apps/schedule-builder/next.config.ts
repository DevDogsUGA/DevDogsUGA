import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { buildSecurityHeaders } from "@devdogsuga/security-headers";
import { env } from "~/env";

/**
 * A function, not a plain object, only so it can see which `phase` next.js
 * (or vinext -- see below) invoked it for: local dev needs one extra key
 * that build/deploy must never see.
 *
 * `next dev` runs plain Node, not workerd, so it has nothing behind the
 * `cloudflare:workers` specifier `~/server/db`, `~/server/attendance/
 * rateLimit.ts`, and `~/server/email/send.ts` import -- Turbopack has no
 * built-in resolution for the `cloudflare:` scheme, so it fails to resolve
 * at all rather than yielding empty bindings the way workerd would outside a
 * deployed Worker. `turbopack.resolveAlias` papers over that with a stub
 * module exporting an empty `env` (dev/cloudflare-workers-stub.ts), which
 * those call sites already treat as "no bindings" and fall back accordingly.
 *
 * That alias is gated to `PHASE_DEVELOPMENT_SERVER` specifically because
 * `vinext build` reads this same `next.config.ts` and honors the identical
 * `turbopack.resolveAlias` key (see vinext's `extractTurboAliases`) --
 * applying it unconditionally would swap out the REAL `cloudflare:workers`
 * binding in the built/deployed Worker too. `vinext build` runs under
 * `PHASE_PRODUCTION_BUILD`, never this one, so the two tools never collide
 * on the same phase value.
 */
const nextConfig = (phase: string): NextConfig => ({
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        // Same `??` fallback as `apps/platform/next.config.ts`'s
        // `images.remotePatterns`: CI's credential-free validate job loads
        // this config (`next typegen`) with `SKIP_ENV_VALIDATION` set, where
        // `env.NEXT_PUBLIC_SUPABASE_URL` is `undefined` rather than a real
        // URL. A real build/dev run never takes the fallback.
        headers: buildSecurityHeaders({
          environment: env.DEPLOY_ENV,
          supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
          sentryDsn: env.NEXT_PUBLIC_SCHEDULE_BUILDER_SENTRY_DSN,
          // This static `headers()` declaration is evaluated once at
          // build/dev-server start, not per request, so it can never mint a
          // real nonce -- and never needs to: it is a fallback purely for
          // routes middleware's matcher excludes (static assets, images),
          // none of which carry an inline script to gate. See
          // `applySecurityHeaders`'s doc comment.
          nonce: "unused-static-fallback",
        }),
      },
    ];
  },
  ...(phase === PHASE_DEVELOPMENT_SERVER
    ? {
        turbopack: {
          resolveAlias: {
            "cloudflare:workers": "./dev/cloudflare-workers-stub.ts",
          },
        },
      }
    : {}),
});

export default nextConfig;
