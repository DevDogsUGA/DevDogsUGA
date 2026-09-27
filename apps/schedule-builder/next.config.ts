import type { NextConfig } from "next";
import { buildSecurityHeaders } from "@devdogsuga/security-headers";
import { env } from "~/env";

const nextConfig = {
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
} satisfies NextConfig;

export default nextConfig;
