import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { buildSecurityHeaders } from "@devdogsuga/security-headers";
import { env } from "~/env";

/**
 * A function only so it can see the phase. `next dev` runs in Node, not
 * workerd, so `~/server/db`'s `cloudflare:workers` import is aliased to an
 * empty stub (dev/cloudflare-workers-stub.ts). The alias is limited to
 * `PHASE_DEVELOPMENT_SERVER` because `vinext build` reads this same file and
 * honors `turbopack.resolveAlias` too; applied unconditionally it would
 * replace the real binding in the deployed Worker.
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
