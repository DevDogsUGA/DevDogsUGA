import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

import {
  DEPLOY_ENVIRONMENTS,
  declare,
  define,
  resolveEnvironment,
} from "@devdogsuga/env";

/**
 * Which deployment this build is for, resolved ONCE, while the schemas below
 * are still being constructed.
 *
 * `resolveEnvironment()` throws `UnknownEnvironmentError` on anything that is
 * not development/staging/production, and throwing at import time is the fix,
 * not a hazard. It matters more here than it looks: under the old local
 * `switchEnvironment()`, an unrecognised value was `!== "development"`, so
 * NEXT_PUBLIC_AUTH_MODE below defaulted to "google" and the app still worked
 * — configured and wrong. An *absent* value still falls the other way, to
 * "devdogs"; `wrangler.jsonc` sets DEPLOY_ENV in every env block, which is
 * what keeps a deployed build off the platform's dev OAuth server.
 *
 * `SKIP_ENV_VALIDATION` short-circuits the resolution because `skipValidation`
 * below only skips *parsing* — the schema selection here runs at import time
 * regardless, and a build that explicitly asked not to validate should not
 * crash on a stray DEPLOY_ENV. (CI sets the flag with no DEPLOY_ENV at all;
 * unset resolves to development anyway.)
 */
const environment = process.env.SKIP_ENV_VALIDATION
  ? "development"
  : resolveEnvironment();

function switchEnvironment<T, R>(opt: { local: T; deployed: R }) {
  return environment === "development" ? opt.local : opt.deployed;
}

/**
 * Server-side variables. Every schema goes through `define()`, which records
 * scope and secrecy into the `@devdogsuga/env` registry — `.env.example` and
 * the `env push` routing are derived from these declarations. Keys shared
 * with the platform app (the Supabase connection block, CRON_SECRET) are
 * deliberately declared in BOTH manifests with the same metadata: the
 * completeness test asserts duplicates agree, and divergence is a bug worth
 * failing on.
 */
const server = {
  // Not read through `env` -- the resolution above needs it while this schema
  // is still being built; registered here so tooling sees it.
  DEPLOY_ENV: define(z.enum(DEPLOY_ENVIRONMENTS).default("development"), {
    doc:
      "Which deployment this is: development, staging, or production. Never " +
      "written into an env file -- wrangler.jsonc's per-env blocks and the " +
      "cf:build:* scripts are its two committed sources.",
    scope: "default",
    secrecy: "public",
    commented: true,
  }),
  CRON_SECRET: define(
    switchEnvironment({
      local: z.string().default(""),
      deployed: z.string().min(32),
    }),
    {
      doc:
        "Bearer token checked by the /api/cron/* routes and cron triggers. " +
        "One value shared across every app in the repo; deployed " +
        "environments require at least 32 characters.",
      scope: "environment",
      secrecy: "secret",
    },
  ),
  // Derived (.env / .env.generated). `localStack: true` throughout: when the
  // local Docker stack is running, `.env.generated` supplies these and wins
  // over `.env`. Secrecy per key mirrors the platform manifest -- see the
  // block comment there for why the URLs are public.
  API_URL: define(z.string(), {
    doc:
      "The Supabase project's base URL. Supplied by .env.generated when the " +
      "local stack is running, and mirrored into NEXT_PUBLIC_SUPABASE_URL " +
      "for the browser.",
    scope: "environment",
    secrecy: "public",
    localStack: true,
    example: "https://$PROJECT_REF.supabase.co",
  }),
  DB_URL: define(z.string(), {
    doc:
      "Postgres connection string -- the session pooler (port 5432), NOT " +
      "the transaction pooler: drizzle-kit relies on prepared statements " +
      "the transaction pooler does not support and hangs instead of " +
      "erroring. Also read by the RLS persona suite, which falls back to " +
      "the local default when unset -- a stale value here is ignored rather " +
      "than pointed at a real database. " +
      "⚠️ In .env.preflight this must be the migration_planner " +
      "role -- SELECT on supabase_migrations.schema_migrations and nothing " +
      "else -- NEVER the full connection string. That file feeds an " +
      "environment `main` can read, and nothing can detect a full string " +
      "pasted here: the dry run works, push succeeds, audit stays green.",
    scope: "environment",
    secrecy: "secret",
    localStack: true,
    // Kept in step with the platform manifest's declaration -- duplicates must
    // agree on every field. See `EnvMeta.narrowed` for what the marker buys.
    narrowed: true,
    example:
      "postgresql://postgres.$PROJECT_REF:<password>@<host>:5432/postgres",
  }),
  // FUNCTIONS_URL: z.string(),
  // GRAPHQL_URL: z.string(),
  PUBLISHABLE_KEY: define(z.string(), {
    doc:
      "The Supabase publishable (anon) API key. Safe in a browser -- Row " +
      "Level Security is what protects the data -- and mirrored into " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Dashboard: Settings > API.",
    scope: "environment",
    secrecy: "public",
    localStack: true,
  }),
  REST_URL: define(z.string(), {
    doc: "The PostgREST endpoint: API_URL plus /rest/v1.",
    scope: "environment",
    secrecy: "public",
    localStack: true,
    example: "https://$PROJECT_REF.supabase.co/rest/v1",
  }),
  S3_PROTOCOL_ACCESS_KEY_ID: define(z.string(), {
    doc:
      "Access-key id for the Storage S3 protocol (Settings > Storage > S3 " +
      "Connection). Half of a credential pair, so stored beside its secret.",
    scope: "environment",
    secrecy: "secret",
    localStack: true,
  }),
  S3_PROTOCOL_ACCESS_KEY_SECRET: define(z.string(), {
    doc: "Secret half of the Storage S3 credential pair.",
    scope: "environment",
    secrecy: "secret",
    localStack: true,
  }),
  S3_PROTOCOL_REGION: define(z.string(), {
    doc: "Storage S3 region -- us-east-1 in production, us-east-2 in staging.",
    scope: "environment",
    secrecy: "public",
    localStack: true,
    example: "us-east-1",
  }),
  SECRET_KEY: define(z.string(), {
    doc:
      "The Supabase service-role key. Bypasses Row Level Security entirely " +
      "-- server-side only, never in any client bundle. Dashboard: Settings > API.",
    scope: "environment",
    secrecy: "secret",
    localStack: true,
  }),
  STORAGE_S3_URL: define(z.string(), {
    doc: "The Storage S3 endpoint for the project.",
    scope: "environment",
    secrecy: "public",
    localStack: true,
    example: "https://$PROJECT_REF.storage.supabase.co/storage/v1/s3",
  }),
  // Custom OAuth2 provider ("Sign in with DevDogs" — used in dev only, so
  // optional; production authenticates via the shared Google provider).
  //
  // The client id is public, like every OAuth client id: it travels in the
  // clear on each authorization redirect. The URLs are public too — they are
  // endpoints, not credentials. Only the client secret is one.
  OAUTH_CLIENT_ID: define(z.string().optional(), {
    doc:
      "'Sign in with DevDogs' OAuth client id, dev only -- production " +
      "authenticates via the shared Google provider. Unset disables the " +
      "provider; register one with `pnpm devtools oauth`.",
    scope: "environment",
    secrecy: "public",
    commented: true,
  }),
  OAUTH_CLIENT_SECRET: define(z.string().optional(), {
    doc: "'Sign in with DevDogs' OAuth client secret, dev only.",
    scope: "environment",
    secrecy: "secret",
    commented: true,
  }),
  OAUTH_AUTHORIZATION_URL: define(z.string().url().optional(), {
    doc: "'Sign in with DevDogs' authorization endpoint, dev only.",
    scope: "environment",
    secrecy: "public",
    commented: true,
    example: "https://your-provider.example.com/oauth/authorize",
  }),
  // GoTrue calls the token and userinfo URLs server-side, so they cannot be
  // localhost even in local dev.
  OAUTH_TOKEN_URL: define(z.string().url().optional(), {
    doc:
      "'Sign in with DevDogs' token endpoint, dev only. GoTrue calls it " +
      "server-side, so it cannot be localhost even in local dev.",
    scope: "environment",
    secrecy: "public",
    commented: true,
    example: "https://your-provider.example.com/oauth/token",
  }),
  OAUTH_USERINFO_URL: define(z.string().url().optional(), {
    doc:
      "'Sign in with DevDogs' userinfo endpoint, dev only. GoTrue calls it " +
      "server-side, so it cannot be localhost even in local dev.",
    scope: "environment",
    secrecy: "public",
    commented: true,
    example: "https://your-provider.example.com/oauth/userinfo",
  }),
  // Built-ins
  NODE_ENV: define(
    z.enum(["development", "test", "production"]).default("development"),
    {
      doc: "Set by the framework; never written into an env file.",
      scope: "default",
      secrecy: "public",
      commented: true,
    },
  ),
};

const client = {
  NEXT_PUBLIC_SUPABASE_URL: define(z.string().url(), {
    doc:
      "Browser-side copy of API_URL. Derived -- .env assigns it from " +
      "$API_URL -- so it is never set by hand.",
    scope: "environment",
    secrecy: "public",
    example: "$API_URL",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: define(z.string().min(1), {
    doc:
      "Browser-side copy of PUBLISHABLE_KEY. Derived -- .env assigns it " +
      "from $PUBLISHABLE_KEY -- so it is never set by hand.",
    scope: "environment",
    secrecy: "public",
    example: "$PUBLISHABLE_KEY",
  }),
  // Which sign-in provider to use: "devdogs" = the platform's OAuth server
  // (dev default), "google" = shared Google provider (production default).
  NEXT_PUBLIC_AUTH_MODE: define(
    z
      .enum(["devdogs", "google"])
      .default(switchEnvironment({ local: "devdogs", deployed: "google" })),
    {
      doc:
        "Which sign-in provider to use: devdogs (the platform's OAuth " +
        "server, dev default) or google (the shared Google provider, " +
        "production default). Unset picks the per-environment default.",
      scope: "environment",
      secrecy: "public",
      commented: true,
      example: "devdogs",
    },
  ),
};

/**
 * Registers this app's manifest with `@devdogsuga/env` — alongside
 * `createEnv`, not instead of it: @t3-oss keeps the runtime behaviour,
 * `declare()` makes the variables visible to the tooling that derives
 * `.env.example` and the secrets routing, and it throws on any schema that
 * skipped `define()`.
 */
declare({ source: "schedule-builder", server, client });

export const env = createEnv({
  server,
  client,
  /**
   * Only client keys need listing: Next.js stopped static analysis of
   * server-side `process.env`, so @t3-oss reads those from `process.env`
   * directly (NODE_ENV included). The `NEXT_PUBLIC_*` values are inlined into
   * the browser bundle by STATIC analysis — each entry must be the literal
   * text `process.env.NEXT_PUBLIC_FOO`, because a computed lookup is silently
   * `undefined` in the browser.
   */
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
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
