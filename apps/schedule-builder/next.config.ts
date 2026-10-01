import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { buildSecurityHeaders } from "@devdogsuga/headers";
import { scheduleBuilderCsp } from "~/config/csp";
import { env } from "~/env";

/**
 * A function only so it can see the phase. `next dev` runs in Node, not
 * workerd, so `~/server/db`'s `cloudflare:workers` import is aliased to an
 * empty stub (dev/cloudflare-workers-stub.ts). vinext reads this same file
 * and honors `turbopack.resolveAlias` too, so the alias must reach neither
 * `vinext build`, where it would replace the real binding in the deployed
 * Worker, nor `vinext dev`, which runs in workerd with real bindings and
 * crashes on boot when `ScrapeWorkflow extends WorkflowEntrypoint` gets the
 * stub's `undefined`. vinext passes `PHASE_DEVELOPMENT_SERVER` for `vinext
 * dev` as well, so the phase alone can't tell them apart; `TURBOPACK` is set
 * only by Next's own CLI.
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
          csp: scheduleBuilderCsp({
            environment: env.DEPLOY_ENV,
            supabaseUrl:
              env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
            // No nonce: this static `headers()` declaration is evaluated once
            // at build/dev-server start, not per request, so it can never
            // mint one -- and never needs to: it is a fallback purely for
            // routes middleware's matcher excludes (static assets, images),
            // none of which carry an inline script to gate.
            sentryDsn: env.NEXT_PUBLIC_SCHEDULE_BUILDER_SENTRY_DSN,
          }),
        }),
      },
    ];
  },
  ...(phase === PHASE_DEVELOPMENT_SERVER && process.env.TURBOPACK
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
