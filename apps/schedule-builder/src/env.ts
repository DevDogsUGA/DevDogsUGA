import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

function switchEnvironment<T, R>(opt: { local: T; deployed: R }) {
  return process.env.DEPLOY_ENV && process.env.DEPLOY_ENV !== "development"
    ? opt.deployed
    : opt.local;
}

export const env = createEnv({
  server: {
    CRON_SECRET: switchEnvironment({
      local: z.string().default(""),
      deployed: z.string().min(32),
    }),
    // Derived (.env / .env.generated)
    API_URL: z.string(),
    DB_URL: z.string(),
    // FUNCTIONS_URL: z.string(),
    // GRAPHQL_URL: z.string(),
    PUBLISHABLE_KEY: z.string(),
    REST_URL: z.string(),
    S3_PROTOCOL_ACCESS_KEY_ID: z.string(),
    S3_PROTOCOL_ACCESS_KEY_SECRET: z.string(),
    S3_PROTOCOL_REGION: z.string(),
    SECRET_KEY: z.string(),
    STORAGE_S3_URL: z.string(),
    // Custom OAuth2 provider ("Sign in with DevDogs" — used in dev only, so
    // optional; production authenticates via the shared Google provider).
    OAUTH_CLIENT_ID: z.string().optional(),
    OAUTH_CLIENT_SECRET: z.string().optional(),
    OAUTH_AUTHORIZATION_URL: z.string().url().optional(),
    OAUTH_TOKEN_URL: z.string().url().optional(),
    OAUTH_USERINFO_URL: z.string().url().optional(),
    // Built-ins
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    // Which sign-in provider to use: "devdogs" = the platform's OAuth server
    // (dev default), "google" = shared Google provider (production default).
    NEXT_PUBLIC_AUTH_MODE: z
      .enum(["devdogs", "google"])
      .default(switchEnvironment({ local: "devdogs", deployed: "google" })),
  },
  runtimeEnv: {
    CRON_SECRET: process.env.CRON_SECRET,
    // Derived (.env / .env.generated)
    API_URL: process.env.API_URL,
    DB_URL: process.env.DB_URL,
    // FUNCTIONS_URL: process.env.FUNCTIONS_URL,
    // GRAPHQL_URL: process.env.GRAPHQL_URL,
    PUBLISHABLE_KEY: process.env.PUBLISHABLE_KEY,
    REST_URL: process.env.REST_URL,
    S3_PROTOCOL_ACCESS_KEY_ID: process.env.S3_PROTOCOL_ACCESS_KEY_ID,
    S3_PROTOCOL_ACCESS_KEY_SECRET: process.env.S3_PROTOCOL_ACCESS_KEY_SECRET,
    S3_PROTOCOL_REGION: process.env.S3_PROTOCOL_REGION,
    SECRET_KEY: process.env.SECRET_KEY,
    STORAGE_S3_URL: process.env.STORAGE_S3_URL,
    OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
    OAUTH_AUTHORIZATION_URL: process.env.OAUTH_AUTHORIZATION_URL,
    OAUTH_TOKEN_URL: process.env.OAUTH_TOKEN_URL,
    OAUTH_USERINFO_URL: process.env.OAUTH_USERINFO_URL,
    // Client-side Supabase (mirrored from API_URL / PUBLISHABLE_KEY by sb:start)
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
    // Built-ins
    NODE_ENV: process.env.NODE_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation —
   * used by CI and Cloudflare/Docker builds that run without secrets.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Treat empty strings as undefined so `SOME_VAR=''` fails a required var
   * instead of silently passing.
   */
  emptyStringAsUndefined: true,
});
