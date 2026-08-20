/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
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
  cacheComponents: true,
  experimental: {
    authInterrupts: true,
  },
  images: {
    remotePatterns: [
      // The `??` is for SKIP_ENV_VALIDATION only (`env.*` is required
      // otherwise): `next typegen` in CI's credential-free validate job has
      // to LOAD this config, and `new URL(path, undefined)` throws before
      // anything renders. A real build never takes the fallback — the
      // database job builds with validation enforced and a real URL.
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
