import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

function switchEnvironment<T, R>(opt: { local: T; vercel: R }) {
  return process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development"
    ? opt.vercel
    : opt.local;
}

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    // User-specified (.env)
    BASE_URL: switchEnvironment({
      local: z.url().default(`http://localhost:${process.env.PORT ?? 3000}`),
      vercel: z
        .string()
        .transform((str) => "https://" + str)
        .pipe(z.url()),
    }),
    CRON_SECRET: switchEnvironment({
      local: z.string().default(""),
      vercel: z.string().min(32),
    }),
    DEVDOGS_EPOCH: z.coerce.date().default(new Date(2024, 7, 22)),
    DISCORD_GUILD_ID: z.string(),
    DISCORD_PUBLIC_KEY: z.string(),
    DISCORD_TOKEN: z.string(),
    GITHUB_ORG: z.string(),
    GITHUB_TOKEN: z.string(),
    GITHUB_WEBHOOK_SECRET: switchEnvironment({
      local: z.string().default(""),
      vercel: z.string().min(20),
    }),
    // Derived (.env.supabase)
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
    // Built-ins
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string(),
    NEXT_PUBLIC_AVATARS_BUCKET: z.string(),
    NEXT_PUBLIC_FEEDBACK_BUCKET: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    // User-specified (.env)
    BASE_URL:
      process.env.BASE_URL ??
      (process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_URL),
    CRON_SECRET: process.env.CRON_SECRET,
    DEVDOGS_EPOCH: process.env.DEVDOGS_EPOCH,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    GITHUB_ORG: process.env.GITHUB_ORG,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    // Derived (.env.local)
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
    // Client-side Supabase (mirrored from API_URL / PUBLISHABLE_KEY by sb:start)
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AVATARS_BUCKET: process.env.NEXT_PUBLIC_AVATARS_BUCKET,
    NEXT_PUBLIC_FEEDBACK_BUCKET: process.env.NEXT_PUBLIC_FEEDBACK_BUCKET,
    // Built-ins
    NODE_ENV: process.env.NODE_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
