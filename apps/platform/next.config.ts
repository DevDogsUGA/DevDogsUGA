/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation, which
 * Docker builds need.
 */
import type { NextConfig } from "next";
import { buildSecurityHeaders } from "@devdogsuga/sdk/headers";
import { env } from "~/env";
import { platformSecurityHeaders } from "~/lib/securityHeaders";
import { SOCIALS } from "~/config/socials";

const config = {
  async headers() {
    return [
      {
        source: "/:path*",
        // No nonce: a fallback purely for routes middleware's matcher
        // excludes (static assets, images), none of which carry an inline
        // script to gate. See `applySecurityHeaders`'s doc comment.
        headers: buildSecurityHeaders(platformSecurityHeaders()),
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/dashboard/profile",
        permanent: true,
      },
      {
        source: "/settings/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
      { source: "/console", destination: "/dashboard", permanent: true },
      {
        source: "/console/attendance/:path*",
        destination: "/dashboard/meetings/:path*",
        permanent: true,
      },
      {
        source: "/console/meetings/:path*",
        destination: "/dashboard/schedule/:path*",
        permanent: true,
      },
      {
        source: "/console/projects",
        destination: "/dashboard/reviews",
        permanent: true,
      },
      {
        source: "/console/projects/:id",
        destination: "/dashboard/projects/:id",
        permanent: true,
      },
      // The review queue once had a page per project; the project's own page
      // serves its advisor now.
      {
        source: "/dashboard/reviews/:id",
        destination: "/dashboard/projects/:id",
        permanent: true,
      },
      {
        source: "/console/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
      {
        source: "/projects",
        destination: "/dashboard/projects",
        permanent: true,
      },
      {
        source: "/projects/:id/report",
        destination: "/dashboard/projects/:id/report",
        permanent: true,
      },
      {
        source: "/attendance",
        destination: "/dashboard/attendance",
        permanent: true,
      },
      {
        source: "/account",
        destination: "/dashboard/profile",
        permanent: true,
      },
      {
        source: "/account/deletion",
        destination: "/dashboard/deletion",
        permanent: true,
      },
      {
        source: "/preview/docs/:path*",
        destination: "/dashboard/docs-preview/:path*",
        permanent: true,
      },
      {
        source: "/tools/oauth",
        destination: "/dashboard/oauth",
        permanent: true,
      },
      {
        source: "/leadership",
        destination: "https://forms.gle/WS4NNd72zMAy6VXn6",
        permanent: false,
      },
      // devdogsuga.org/discord, /instagram, /linkedin, /github.
      ...SOCIALS.map(({ path, url }) => ({
        source: path,
        destination: url,
        permanent: false,
      })),
      {
        source: "/georgia311",
        destination: "https://forms.gle/ErNLxLep3MwMUe6t7",
        permanent: false,
      },
    ];
  },
  // NOT `cacheComponents: true`, deliberately, since 2026-08-20: Cache
  // Components' partial prerendering was broken on the OpenNext Cloudflare
  // adapter (opennextjs-cloudflare#1115: cached shells served without
  // dynamic streaming; ours was worse -- every `◐` route hung in workerd
  // until the runtime killed the request). vinext replaces that adapter, but
  // this flag hasn't been re-evaluated against it yet -- that is a
  // deliberate separate change, not folded into this migration.
  // `experimental.useCache` keeps the `"use cache"` + `cacheLife` directives
  // (DocsMarkdown and friends) compiling and caching; only the PPR machinery
  // is off.
  //
  // ⚠️ `experimental.useCache` prints "is deprecated. Please use the
  // top-level `cacheComponents` option instead". Read next's own config.js
  // (search `E1465`) before "fixing" that: `cacheComponents` is a plain
  // boolean with no partial mode, and setting it ALSO flips
  // `experimental.ppr = true` internally. This deprecated flag is the only way
  // to get `"use cache"` without PPR.
  experimental: {
    authInterrupts: true,
    useCache: true,
  },
  images: {
    remotePatterns: [
      // The `??` is for SKIP_ENV_VALIDATION only (`env.*` is required
      // otherwise): `next typegen` in CI's credential-free validate job has
      // to LOAD this config, and `new URL(path, undefined)` throws before
      // anything renders. A real build never takes the fallback. The database
      // job builds with validation enforced and a real URL.
      new URL(
        "/storage/v1/object/public/**",
        env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
      ),
    ],
    dangerouslyAllowLocalIP: env.NODE_ENV !== "production",
  },
  ...(env.NODE_ENV !== "production" && process.env.DEV_VPN_HOST
    ? { allowedDevOrigins: [process.env.DEV_VPN_HOST] }
    : {}),
} satisfies NextConfig;

export default config;
