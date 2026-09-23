import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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
 * `resolveEnvironment()` throws `UnknownEnvironmentError` on anything but
 * development/staging/production. Throwing at import time is deliberate: the
 * old local `switchEnvironment()` treated any value `!== "development"` as
 * deployed, so a stray `DEPLOY_ENV=production-apply` applied the strict schemas
 * while every `=== "production"` gate stayed shut. The app looked configured
 * and served the wrong thing, in both directions.
 *
 * `SKIP_ENV_VALIDATION` short-circuits the resolution rather than riding on
 * `skipValidation` below, because that flag only skips *parsing*. The schema
 * *selection* here runs at import time regardless. CI builds set the flag with
 * no `DEPLOY_ENV` at all (unset resolves to development anyway); the guard is
 * for the odd bad value, which should not crash a build that asked not to
 * validate.
 */
const environment = process.env.SKIP_ENV_VALIDATION
  ? "development"
  : resolveEnvironment();

function switchEnvironment<T, R>(opt: { local: T; deployed: R }) {
  return environment === "development" ? opt.local : opt.deployed;
}

/**
 * Server-side variables. Every schema goes through `define()`, which records
 * the variable's scope, secrecy and routing into the `@devdogsuga/env`
 * registry. The tooling derives `.env.example` and the `env push` key lists
 * from those records, so an entry here is the whole paper trail a variable
 * gets.
 */
const server = {
  // Not read through `env`: the resolution above needs it while this schema is
  // still being constructed, and the call sites are plain
  // `process.env.DEPLOY_ENV` comparisons. Declared here so it is registered;
  // `resolveEnvironment()` is what fails a typo, at import time.
  //
  // Set by `wrangler.jsonc` per env block at runtime and by the `cf:build:*`
  // scripts at build time. Never a GitHub environment secret, never in any
  // .env file, and skipped by `env push`: it has two agreeing committed
  // sources already.
  DEPLOY_ENV: define(z.enum(DEPLOY_ENVIRONMENTS).default("development"), {
    doc:
      "Which deployment this is: development, staging, or production. Never " +
      "written into an env file -- wrangler.jsonc's per-env blocks and the " +
      "cf:build:* scripts are its two committed sources.",
    scope: "default",
    secrecy: "public",
    commented: true,
  }),
  // User-specified (.env)
  BASE_URL: define(
    switchEnvironment({
      local: z.url().default(`http://localhost:${process.env.PORT ?? 3000}`),
      deployed: z.url(),
    }),
    {
      doc:
        "The public URL of the app this manifest belongs to. config.toml reads " +
        "it as auth.site_url, and schedule-builder's daily cron dispatcher " +
        "fetches its own scraper routes through it. Each app defaults to its " +
        "own localhost port in development.",
      scope: "environment",
      secrecy: "public",
      example: "http://localhost:3000",
    },
  ),
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
  // Sentry ingest DSN for the "platform" project (see @devdogsuga/telemetry).
  // Optional and empty by default, deliberately: the org is not onboarded in
  // every environment yet, and `buildSentryOptions` treats a falsy DSN as
  // "skip Sentry.init entirely" -- no init, no network calls, no console
  // noise. A DSN is not a secret (it identifies a project, not a credential
  // -- anyone can only submit events, never read them), but it reaches the
  // Worker the same way every other environment variable does: Bitwarden ->
  // `env push` -> the next deploy. wrangler.jsonc carries no secrets and
  // never will for this value.
  SENTRY_DSN: define(z.string().url().optional(), {
    doc:
      "Sentry ingest DSN for this app's Sentry project (see " +
      "@devdogsuga/telemetry). Optional -- empty skips Sentry.init " +
      "entirely, which is the state before the org is onboarded and the " +
      "state of local development. Reaches the Worker like every other " +
      "environment variable.",
    scope: "environment",
    secrecy: "public",
  }),
  ATTENDANCE_TOKEN_SECRET: define(
    switchEnvironment({
      local: z.string().default("local-attendance-secret-not-for-deployment"),
      deployed: z.string().min(32),
    }),
    {
      doc:
        "HMAC key for rotating attendance QR challenges, manual codes, and " +
        "pending OAuth claims. Use a different random value in each " +
        "environment; changing it invalidates outstanding challenges.",
      scope: "environment",
      secrecy: "secret",
    },
  ),
  DEVDOGS_EPOCH: define(z.coerce.date().default(new Date(2024, 7, 22)), {
    doc:
      "Epoch used for DevDogs id/time math. The default is the club's " +
      "founding date; nothing ever overrides it.",
    scope: "default",
    secrecy: "public",
  }),
  // Scope "default" AND a schema default (since 2026-08-20; the DEVDOGS_EPOCH
  // pattern): every environment shares one guild, since the bots differ by
  // channel rather than by guild, so the committed id doubles as the fallback
  // and a bare environment boots without the line. A set value still
  // overrides, which is how ci.env keeps its obvious placeholder.
  DISCORD_GUILD_ID: define(z.string().default("1231994798165069987"), {
    doc:
      "The club's Discord guild. One shared guild across every environment " +
      "-- the bots differ by alert channel, not by guild.",
    scope: "default",
    secrecy: "public",
    example: "1231994798165069987",
  }),
  DISCORD_PUBLIC_KEY: define(z.string(), {
    doc:
      "Verifies Discord interaction signatures on the slash-command " +
      "endpoint. Per-bot, so per-environment.",
    scope: "environment",
    secrecy: "secret",
  }),
  DISCORD_TOKEN: define(z.string(), {
    doc: "The Discord bot token, for role sync and slash commands.",
    scope: "environment",
    secrecy: "secret",
  }),
  // Same "default" reasoning as DISCORD_GUILD_ID, schema default included.
  GITHUB_ORG: define(z.string().default("DevDogsUGA"), {
    doc:
      "The GitHub organization the platform administers. Any non-empty " +
      "placeholder is enough to run the app locally.",
    scope: "default",
    secrecy: "public",
    example: "DevDogsUGA",
  }),
  // The DevDogs GitHub App, which replaced an org-owner `ghp_` token. Every
  // GitHub call this platform makes is an organization administration action,
  // so under the old shape a compromise of this Worker was an organization
  // takeover. See server/github/client.ts.
  //
  // The id and installation id are visible in any webhook payload, so they are
  // NOT secrets and are GitHub environment *variables*. The private key is a
  // secret, and a multi-line PEM.
  GH_APP_ID: define(z.coerce.number().int().positive(), {
    doc:
      "The DevDogs GitHub App's id. Not a secret -- it appears in every " +
      "webhook payload. Required at boot but only used by org invites and " +
      "team provisioning, so the numeric placeholder is enough to run the " +
      "app locally.",
    scope: "environment",
    secrecy: "public",
    example: "000000",
  }),
  GH_APP_INSTALLATION_ID: define(z.coerce.number().int().positive(), {
    doc:
      "The App's installation id on the organization. Not a secret -- " +
      "visible in any webhook payload. Like GH_APP_ID, the placeholder " +
      "is enough unless you are working on the org integration.",
    scope: "environment",
    secrecy: "public",
    example: "00000000",
  }),
  GH_APP_PRIVATE_KEY: define(
    z
      .string()
      .min(1)
      .refine((v) => v.includes("BEGIN") && v.includes("PRIVATE KEY"), {
        message:
          "GH_APP_PRIVATE_KEY must be the PEM itself, not a path or an id. " +
          "Newlines matter; keep it quoted.",
      }),
    {
      doc:
        "The App's private key: the PEM itself, on one line, double-quoted, " +
        "with \\n escapes -- the newlines are load-bearing, and a key that " +
        "lost them parses as a string and fails to sign. It mints " +
        "installation tokens indefinitely, which makes it the organization " +
        "credential.",
      scope: "environment",
      secrecy: "secret",
      // The placeholder documents the one-line \n-escaped shape, which is the
      // part people get wrong when pasting a real key.
      example:
        "-----BEGIN RSA PRIVATE KEY-----\\nPLACEHOLDER-NOT-A-REAL-KEY-see-docs-platform-env-md\\n-----END RSA PRIVATE KEY-----\\n",
    },
  ),
  // Shared secret configured on the App's webhook (`/github/webhook`),
  // which is how the team mirror stays live rather than waiting out the
  // nightly reconcile: GitHub signs every delivery with it, and the route
  // verifies `X-Hub-Signature-256` before trusting a membership, team or
  // branch event -- see server/github/webhookSignature.ts. Same shape as
  // CRON_SECRET: an empty local default lets `next dev` boot with no
  // webhook configured (the route only enforces the check when deployed),
  // deployed environments require at least 32 characters.
  //
  // The name, and the `GH_` (not `GITHUB_`) prefix, are not new: the
  // platform redesign's teams-core step deleted this same key along with
  // the PR-entry webhook it used to authenticate, retargeting teams away
  // from per-competition branches. This step reintroduces the webhook
  // against the new team-branch model, and reuses the key GitHub Actions
  // already forced onto the App credentials -- it refuses secret/variable
  // names starting with `GITHUB_`, which `env/completeness.test.ts` asserts
  // so this does not get relearned.
  GH_WEBHOOK_SECRET: define(
    switchEnvironment({
      local: z.string().default(""),
      deployed: z.string().min(32),
    }),
    {
      doc:
        "Shared secret configured on the DevDogs GitHub App's webhook. " +
        "Verifies X-Hub-Signature-256 on every delivery to /github/webhook " +
        "before any team-mirror event is trusted.",
      scope: "environment",
      secrecy: "secret",
    },
  ),
  // The repository team branches live in. Defaulted rather than required:
  // every existing deployment predates teams, and a new required variable
  // would stop them booting over a feature they do not use yet.
  //
  // The old default, "DevDogs-Website", stopped being a real repository name
  // when this repo was renamed to "DevDogsUGA". Reads survived on GitHub's
  // redirect; the writes team provisioning performs, createRef and
  // addOrUpdateRepoPermissionsInOrg, are not guaranteed to follow one.
  //
  // This IS the deploy repo, deliberately: the `production` branch, not a
  // second repository, is the deploy boundary. The cost is that a team
  // granted push here can reach every other team's branch, because a GitHub
  // team grant is repository-wide with no branch dimension. The isolation
  // comes from the branch ruleset `server/github/rulesets.ts` creates per
  // team, restricting pushes on that team's own branch to that team; the
  // 75-rulesets-per-repository ceiling is the real limit on how many teams
  // can exist concurrently.
  GITHUB_COMPETITION_REPO: define(z.string().default("DevDogsUGA"), {
    doc:
      "The repository team branches are cut in -- this one, deliberately: " +
      "the production branch, not a second repo, is the deploy boundary. " +
      "The schema default is right; set it only if that ever stops being " +
      "true.",
    scope: "default",
    secrecy: "public",
    example: "DevDogsUGA",
    commented: true,
  }),
  // The private "Competitions" GitHub Project's GraphQL node id (a
  // `PVT_...` string, not the project's number). Optional: Sloan has to
  // create the Project by hand and note its id, so the platform has to boot
  // without one -- `server/github/
  // competitions.ts` treats an unset value as "competitions ingestion is not
  // configured yet" and no-ops every webhook delivery and reconcile pass
  // rather than failing to start. A committed constant would work for
  // GITHUB_ORG and GITHUB_COMPETITION_REPO because both name things this repo
  // already controls; a Project's node id is assigned by GitHub the moment
  // the Project is created and cannot be predicted ahead of that, so this is
  // `scope: "environment"` -- routed to a real GitHub Actions secret/variable
  // once Sloan sets it. `GH_`, not `GITHUB_`, for the same reason every other
  // routed key naming something GitHub does is `GH_APP_ID`/`GH_WEBHOOK_SECRET`
  // and not `GITHUB_APP_ID`: GitHub Actions reserves the `GITHUB_` prefix for
  // its own automatic variables and refuses to let a workflow define a
  // secret or variable that starts with it.
  GH_COMPETITIONS_PROJECT_ID: define(z.string().default(""), {
    doc:
      'The private "Competitions" GitHub Project\'s GraphQL node id ' +
      "(PVT_...). Empty means competition ingestion is a no-op -- the " +
      "platform boots without it. Find it with `gh project view <number> " +
      "--owner DevDogsUGA --format json --jq .id`.",
    scope: "environment",
    secrecy: "public",
    commented: true,
  }),
  // Derived (.env / .env.generated). `localStack: true` throughout: when the
  // local Docker stack is running, `.env.generated` supplies these and wins
  // over `.env`, so a blank value in a contributor's file is by design.
  //
  // Secrecy is per-key, not per-block. API_URL / REST_URL / STORAGE_S3_URL are
  // public because they derive from PROJECT_REF, which is itself never-secret,
  // and the first two are what NEXT_PUBLIC_* mirrors into the browser. The
  // hand-maintained bws arrays pushed them as secrets by omission; that was an
  // accident of the allowlist shape, not a classification.
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
    // The one key `preflight` carries. Same name, same schema, a role that can
    // see only the migrations table, which is the whole of what a migration
    // dry run needs. See `EnvMeta.narrowed`: without the marker, preflight
    // routed all 45 keys and `env push --target preflight` uploaded the JWT
    // signing key into a project `main` can read.
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
  // The S3 pair splits: the key id never appears in any public payload (so
  // unlike GH_APP_ID there is no argument from exposure), it is half of
  // a credential pair, and keeping it beside its secret in Bitwarden is the
  // simplest thing to rotate. The region is a name the model doc prints in
  // plaintext.
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

/**
 * Client-side variables. Inlined into the browser bundle, so `NEXT_PUBLIC_`
 * prefixed and public by construction.
 */
const client = {
  // Browser-side counterpart of SENTRY_DSN -- the "platform" Sentry project's
  // public DSN is the same value in both places (a DSN is safe in a browser
  // bundle; it can only submit events, never read them), so this is not
  // derived from SENTRY_DSN by code, it is set alongside it. Optional for the
  // same reason: no DSN means `instrumentation-client.ts` skips
  // `Sentry.init()` entirely.
  NEXT_PUBLIC_SENTRY_DSN: define(z.string().url().optional(), {
    doc:
      "Browser-side Sentry DSN for this app's Sentry project. Optional -- " +
      "empty skips client-side Sentry.init() entirely, same contract as " +
      "SENTRY_DSN.",
    scope: "environment",
    secrecy: "public",
  }),
  // The browser has no access to the server-only DEPLOY_ENV (@t3-oss's proxy
  // would throw), and Sentry's `environment` tag needs to distinguish staging
  // from production on the client too. Not derived automatically the way
  // NEXT_PUBLIC_SUPABASE_URL is from API_URL: DEPLOY_ENV itself is set by
  // wrangler.jsonc's per-env `vars` block and the cf:build:* scripts rather
  // than an `.env` file, so there is nothing for a `.env` assignment to
  // mirror. The cf:build:* scripts set this alongside DEPLOY_ENV instead.
  NEXT_PUBLIC_DEPLOY_ENV: define(
    z.enum(DEPLOY_ENVIRONMENTS).default("development"),
    {
      doc:
        "Browser-side copy of DEPLOY_ENV, for the Sentry `environment` tag on " +
        "client-captured errors. Set alongside DEPLOY_ENV by the cf:build:* " +
        "scripts; defaults to development because that is what an unset " +
        "value means everywhere else in this schema.",
      scope: "environment",
      secrecy: "public",
      example: "staging",
    },
  ),
  // The Supabase pair is derived, not set by hand: `.env` assigns each from
  // its server-side counterpart ($API_URL / $PUBLISHABLE_KEY), which is also
  // how the local stack's generated values reach the browser.
  NEXT_PUBLIC_SUPABASE_URL: define(z.string(), {
    doc:
      "Browser-side copy of API_URL. Derived -- .env assigns it from " +
      "$API_URL -- so it is never set by hand.",
    scope: "environment",
    secrecy: "public",
    example: "$API_URL",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: define(z.string(), {
    doc:
      "Browser-side copy of PUBLISHABLE_KEY. Derived -- .env assigns it " +
      "from $PUBLISHABLE_KEY -- so it is never set by hand.",
    scope: "environment",
    secrecy: "public",
    example: "$PUBLISHABLE_KEY",
  }),
  // Same "default" reasoning as DISCORD_GUILD_ID, schema default included.
  NEXT_PUBLIC_AVATARS_BUCKET: define(z.string().default("avatars"), {
    doc: "Storage bucket for avatars. The same name in every environment.",
    scope: "default",
    secrecy: "public",
    example: "avatars",
  }),
};

/**
 * Registers this app's manifest with `@devdogsuga/env`, alongside `createEnv`
 * rather than instead of it. @t3-oss keeps doing the real runtime work (the
 * client/server split and the proxy that throws when server config is read in
 * a browser bundle); `declare()` makes the variables *visible* to the tooling
 * that derives `.env.example` and the `env push` routing. It throws on any
 * schema that skipped `define()`, so a variable cannot exist here
 * unclassified.
 */
declare({ source: "platform", server, client });

export const env = createEnv({
  server,
  client,
  /**
   * Only client keys need listing: Next.js stopped static analysis of
   * server-side `process.env`, so @t3-oss reads those from `process.env`
   * directly (NODE_ENV included). The `NEXT_PUBLIC_*` values are inlined into
   * the browser bundle by STATIC analysis. Each entry must be the literal text
   * `process.env.NEXT_PUBLIC_FOO`, because a computed lookup is silently
   * `undefined` in the browser.
   */
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AVATARS_BUCKET: process.env.NEXT_PUBLIC_AVATARS_BUCKET,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Treats empty strings as undefined, so `SOME_VAR: z.string()` with
   * `SOME_VAR=''` throws.
   */
  emptyStringAsUndefined: true,
});
