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
 * `resolveEnvironment()` throws `UnknownEnvironmentError` on anything that is
 * not development/staging/production, and throwing at import time is the fix,
 * not a hazard: the old local `switchEnvironment()` treated any value
 * `!== "development"` as deployed, so a stray `DEPLOY_ENV=production-apply`
 * applied the strict schemas while every `=== "production"` gate stayed shut —
 * the app looked configured and served the wrong thing, in both directions at
 * once.
 *
 * `SKIP_ENV_VALIDATION` short-circuits the resolution rather than riding on
 * `skipValidation` below, because that flag only skips *parsing* — the schema
 * *selection* here runs at import time regardless. CI builds set the flag with
 * no `DEPLOY_ENV` at all (unset resolves to development anyway); the guard is
 * for the odd bad value, which should not crash a build that explicitly asked
 * not to validate.
 */
const environment = process.env.SKIP_ENV_VALIDATION
  ? "development"
  : resolveEnvironment();

function switchEnvironment<T, R>(opt: { local: T; deployed: R }) {
  return environment === "development" ? opt.local : opt.deployed;
}

/**
 * Server-side variables. Every schema goes through `define()`, which is what
 * records the variable's classification — scope, secrecy, routing — into the
 * `@devdogsuga/env` registry. `.env.example` and the `env push` key lists
 * are derived from these declarations, so an entry here is the whole paper
 * trail a variable gets.
 */
const server = {
  // Not read through `env` -- the resolution above needs it while this schema
  // is still being constructed, and the call sites are plain
  // `process.env.DEPLOY_ENV` comparisons. It is declared here purely so it is
  // registered; `resolveEnvironment()` is what fails a typo, at import time.
  //
  // Set by `wrangler.jsonc` per env block at runtime and by the `cf:build:*`
  // scripts at build time. Never a GitHub environment secret, never in any
  // .env file, and skipped by `env push` -- it has two agreeing committed
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
        "The platform app's public URL, and config.toml's auth.site_url. " +
        "Defaults to http://localhost:3000 in development.",
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
  DEVDOGS_EPOCH: define(z.coerce.date().default(new Date(2024, 7, 22)), {
    doc:
      "Epoch used for DevDogs id/time math. The default is the club's " +
      "founding date; nothing ever overrides it.",
    scope: "default",
    secrecy: "public",
  }),
  // Scope "default" even though the schema still requires a value: one guild
  // is shared by every environment (the bots differ by channel, not by
  // guild), and the id is committed in .env.example. Folding it into a schema
  // default is a later phase's change -- this file must not alter schema
  // semantics.
  DISCORD_GUILD_ID: define(z.string(), {
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
  // Channel for operational alerts (see server/discord/alerts.ts). Empty
  // means "do not post", the same convention AIRTABLE_BASE_ID and
  // GITHUB_WEBHOOK_SECRET use -- so local development and any environment
  // that has not opted in stay quiet. That default matters here rather than
  // being tidiness: staging shares the club's real Discord guild, so a
  // required value would have staging posting into the officers' channel.
  DISCORD_ALERT_CHANNEL_ID: define(z.string().default(""), {
    doc:
      "Channel for operational alerts. Empty means do not post -- the right " +
      "value everywhere except production, because staging shares the " +
      "club's real Discord guild and a stray value here reaches the " +
      "officers' channel. Production uses 1532424905193160794.",
    scope: "environment",
    secrecy: "public",
  }),
  // Same "default" reasoning as DISCORD_GUILD_ID: identical everywhere and
  // committed in .env.example, but the schema does not default it yet.
  GITHUB_ORG: define(z.string(), {
    doc:
      "The GitHub organization the platform administers. Any non-empty " +
      "placeholder is enough to run the app locally.",
    scope: "default",
    secrecy: "public",
    example: "DevDogsUGA",
  }),
  // The DevDogs GitHub App, which replaced an org-owner `ghp_` token. Every
  // GitHub call this platform makes is an organization administration action,
  // so the old shape meant a compromise of this Worker was an organization
  // takeover. See server/github/client.ts.
  //
  // The id and installation id are NOT secrets -- they are visible in any
  // webhook payload -- so they are GitHub environment *variables*. The private
  // key is, and it is a multi-line PEM.
  GITHUB_APP_ID: define(z.coerce.number().int().positive(), {
    doc:
      "The DevDogs GitHub App's id. Not a secret -- it appears in every " +
      "webhook payload. Required at boot but only used by org invites and " +
      "team provisioning, so the numeric placeholder is enough to run the " +
      "app locally.",
    scope: "environment",
    secrecy: "public",
    example: "000000",
  }),
  GITHUB_APP_INSTALLATION_ID: define(z.coerce.number().int().positive(), {
    doc:
      "The App's installation id on the organization. Not a secret -- " +
      "visible in any webhook payload. Like GITHUB_APP_ID, the placeholder " +
      "is enough unless you are working on the org integration.",
    scope: "environment",
    secrecy: "public",
    example: "00000000",
  }),
  GITHUB_APP_PRIVATE_KEY: define(
    z
      .string()
      .min(1)
      .refine((v) => v.includes("BEGIN") && v.includes("PRIVATE KEY"), {
        message:
          "GITHUB_APP_PRIVATE_KEY must be the PEM itself, not a path or an id. " +
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
  // The repository competition branches live in. Defaulted rather than
  // required: every existing deployment predates competitions, and a new
  // required variable would stop them booting over a feature they do not
  // use yet.
  //
  // The old default, "DevDogs-Website", stopped being a real repository name
  // when this repo was renamed to "DevDogsUGA". Reads survived on GitHub's
  // redirect; the writes team provisioning performs -- createRef,
  // addOrUpdateRepoPermissionsInOrg -- are not guaranteed to follow one.
  //
  // This IS the deploy repo, and deliberately so -- the `production` branch,
  // not a second repository, is the deploy boundary. What that costs is that
  // a competition team granted push here can reach every other team's branch,
  // because GitHub team permissions have no branch dimension: the grant is
  // repository-wide or nothing.
  //
  // The isolation therefore has to come from branch rulesets, one per team,
  // restricting pushes to that team's prefix. Until those exist the isolation
  // is nominal. See the per-team ruleset step in the security plan; the
  // 75-rulesets-per-repository ceiling is the real limit on team count.
  GITHUB_COMPETITION_REPO: define(z.string().default("DevDogsUGA"), {
    doc:
      "The repository competition branches are cut in -- this one, " +
      "deliberately: the production branch, not a second repo, is the " +
      "deploy boundary. The schema default is right; set it only if that " +
      "ever stops being true.",
    scope: "default",
    secrecy: "public",
    example: "DevDogsUGA",
    commented: true,
  }),
  // Verifies `X-Hub-Signature-256` on the PR webhook. Empty means the
  // webhook route refuses every request -- see the route for why that is the
  // right default rather than accepting unsigned payloads.
  GITHUB_WEBHOOK_SECRET: define(z.string().default(""), {
    doc:
      "Verifies X-Hub-Signature-256 on the pull-request webhook, and it is " +
      "the same value pasted into the App's webhook-secret field. Empty " +
      "makes the route refuse every request (503) -- the right local " +
      "default, because an unsigned endpoint that writes submissionState " +
      "would let anyone mark a team as merged. Full setup: " +
      "docs/platform/github-app.md.",
    scope: "environment",
    secrecy: "secret",
  }),
  // Airtable. Optional because the base is provisioned separately and the
  // platform has to boot without it — the sync refuses with a named error
  // rather than the app failing to start. The personal access token is NOT
  // here: it lives in Vault under "airtable_pat". See
  // docs/platform/airtable-setup.md.
  AIRTABLE_BASE_ID: define(z.string().default(""), {
    doc:
      "The officers' Airtable base id -- the id only; the token lives in " +
      "Supabase Vault under airtable_pat. Empty means the sync refuses with " +
      "a named error instead of the app failing to boot, so leave it unset " +
      "until the base exists. Full setup: docs/platform/airtable-setup.md.",
    scope: "environment",
    secrecy: "public",
  }),
  // Supabase OAuth, for sandbox environments. Optional for the same reason
  // as Airtable: the app is registered separately and the platform has to
  // boot without it -- provisioning refuses with `not_configured` rather
  // than the whole app failing to start. See
  // docs/platform/sandbox-environments.md.
  //
  // The client id is public, like every OAuth client id: it travels in the
  // clear on each authorization redirect, so treating it as a secret would
  // only make logs harder to read. (The hand-maintained bws arrays pushed it
  // as a secret by omission; this classification is the deliberate one.)
  SUPABASE_OAUTH_CLIENT_ID: define(z.string().default(""), {
    doc:
      "OAuth client id for 'Sign in with DevDogs' against sandbox " +
      "environments. Empty means provisioning refuses with not_configured, " +
      "so leave both halves empty unless you are working on sandboxes. " +
      "Full setup: docs/platform/sandbox-environments.md.",
    scope: "environment",
    secrecy: "public",
  }),
  SUPABASE_OAUTH_CLIENT_SECRET: define(z.string().default(""), {
    doc:
      "OAuth client secret paired with SUPABASE_OAUTH_CLIENT_ID, for " +
      "sandbox-environment provisioning.",
    scope: "environment",
    secrecy: "secret",
  }),
  // Derived (.env / .env.generated). `localStack: true` throughout: when the
  // local Docker stack is running, `.env.generated` supplies these and wins
  // over `.env`, so a blank value in a contributor's file is by design.
  //
  // Secrecy is per-key, not per-block. API_URL / REST_URL / STORAGE_S3_URL
  // are public because they are derived from PROJECT_REF, which is itself
  // never-secret, and the first two are literally what NEXT_PUBLIC_* mirrors
  // into the browser. The hand-maintained bws arrays pushed them as secrets
  // by omission; that was an accident of the allowlist shape, not a
  // classification.
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
      "than pointed at a real database.",
    scope: "environment",
    secrecy: "secret",
    localStack: true,
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
  // unlike GITHUB_APP_ID there is no argument from exposure), it is half of
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
 * Client-side variables — inlined into the browser bundle, so `NEXT_PUBLIC_`
 * prefixed and public by construction.
 */
const client = {
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
  NEXT_PUBLIC_AVATARS_BUCKET: define(z.string(), {
    doc: "Storage bucket for avatars. The same name in every environment.",
    scope: "default",
    secrecy: "public",
    example: "avatars",
  }),
  NEXT_PUBLIC_FEEDBACK_BUCKET: define(z.string(), {
    doc:
      "Storage bucket for feedback attachments. The same name in every " +
      "environment.",
    scope: "default",
    secrecy: "public",
    example: "feedback-attachments",
  }),
};

/**
 * Registers this app's manifest with `@devdogsuga/env` — alongside `createEnv`,
 * not instead of it. @t3-oss keeps doing the real runtime work (the
 * client/server split and the proxy that throws when server config is read in
 * a browser bundle); `declare()` is what makes the variables *visible* to the
 * tooling that derives `.env.example` and the `env push` routing. It
 * throws on any schema that skipped `define()`, so a variable cannot exist
 * here unclassified.
 */
declare({ source: "platform", server, client });

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
    NEXT_PUBLIC_AVATARS_BUCKET: process.env.NEXT_PUBLIC_AVATARS_BUCKET,
    NEXT_PUBLIC_FEEDBACK_BUCKET: process.env.NEXT_PUBLIC_FEEDBACK_BUCKET,
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
