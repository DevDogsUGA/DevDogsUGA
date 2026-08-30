/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation, which
 * Docker builds need.
 */
import type { NextConfig } from "next";
import { env } from "~/env";

const config = {
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/settings/profile",
        permanent: false,
      },
      {
        source: "/leadership",
        destination: "https://forms.gle/WS4NNd72zMAy6VXn6",
        permanent: false,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.{graphql,gql}": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
    resolveExtensions: [".graphql", ".gql", ".js", ".jsx", ".ts", ".tsx"],
  },
  // NOT `cacheComponents: true`, deliberately, since 2026-08-20: Cache
  // Components' partial prerendering is broken on the OpenNext Cloudflare
  // adapter. Upstream's symptom is cached shells served without dynamic
  // streaming (opennextjs-cloudflare#1115); ours was worse. Every `◐` route
  // hung in workerd until the runtime killed the request ("hung and would
  // never generate a response"), while route handlers, middleware and the
  // database all worked. `experimental.useCache` keeps the `"use cache"` +
  // `cacheLife` directives (DocsMarkdown and friends) compiling and caching;
  // only the PPR machinery is off. Revisit when the adapter supports it.
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
