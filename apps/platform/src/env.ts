import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

function switchEnvironment<T, R>(opt: { local: T; deployed: R }) {
  return process.env.DEPLOY_ENV && process.env.DEPLOY_ENV !== "development"
    ? opt.deployed
    : opt.local;
}

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    // Which deployment this is. Not read through `env` -- `switchEnvironment`
    // above needs it while this schema is still being constructed, and the
    // call sites are plain `process.env.DEPLOY_ENV` comparisons. It is declared
    // here purely so a typo fails the build.
    //
    // Worth the entry because every wrong value fails silently and in the
    // dangerous direction: an unrecognised string is `!== "development"`, so
    // the deployed schemas apply and the app looks configured, but it is also
    // `!== "production"`, so every `=== "production"` gate opens. A stray
    // `DEPLOY_ENV=production-apply` would serve the real homepage instead of
    // <UnderConstruction />.
    //
    // Set by `wrangler.jsonc` per env block at runtime and by the `cf:build:*`
    // scripts at build time. Never a GitHub environment variable, and skipped
    // by `secrets push` -- it has two agreeing committed sources already.
    DEPLOY_ENV: z
      .enum(["development", "staging", "production"])
      .default("development"),
    // User-specified (.env)
    BASE_URL: switchEnvironment({
      local: z.url().default(`http://localhost:${process.env.PORT ?? 3000}`),
      deployed: z.url(),
    }),
    CRON_SECRET: switchEnvironment({
      local: z.string().default(""),
      deployed: z.string().min(32),
    }),
    DEVDOGS_EPOCH: z.coerce.date().default(new Date(2024, 7, 22)),
    DISCORD_GUILD_ID: z.string(),
    DISCORD_PUBLIC_KEY: z.string(),
    DISCORD_TOKEN: z.string(),
    // Channel for operational alerts (see server/discord/alerts.ts). Empty
    // means "do not post", the same convention AIRTABLE_BASE_ID and
    // GITHUB_WEBHOOK_SECRET use -- so local development and any environment
    // that has not opted in stay quiet. That default matters here rather than
    // being tidiness: staging shares the club's real Discord guild, so a
    // required value would have staging posting into the officers' channel.
    DISCORD_ALERT_CHANNEL_ID: z.string().default(""),
    GITHUB_ORG: z.string(),
    GITHUB_TOKEN: z.string(),
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
    GITHUB_COMPETITION_REPO: z.string().default("DevDogsUGA"),
    // Verifies `X-Hub-Signature-256` on the PR webhook. Empty means the
    // webhook route refuses every request -- see the route for why that is the
    // right default rather than accepting unsigned payloads.
    GITHUB_WEBHOOK_SECRET: z.string().default(""),
    // Airtable. Optional because the base is provisioned separately and the
    // platform has to boot without it — the sync refuses with a named error
    // rather than the app failing to start. The personal access token is NOT
    // here: it lives in Vault under "airtable_pat". See
    // docs/platform/airtable-setup.md.
    AIRTABLE_BASE_ID: z.string().default(""),
    // Supabase OAuth, for sandbox environments. Optional for the same reason
    // as Airtable: the app is registered separately and the platform has to
    // boot without it -- provisioning refuses with `not_configured` rather
    // than the whole app failing to start. See
    // docs/platform/sandbox-environments.md.
    SUPABASE_OAUTH_CLIENT_ID: z.string().default(""),
    SUPABASE_OAUTH_CLIENT_SECRET: z.string().default(""),
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
    DEPLOY_ENV: process.env.DEPLOY_ENV,
    // User-specified (.env)
    BASE_URL: process.env.BASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    DEVDOGS_EPOCH: process.env.DEVDOGS_EPOCH,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_ALERT_CHANNEL_ID: process.env.DISCORD_ALERT_CHANNEL_ID,
    GITHUB_ORG: process.env.GITHUB_ORG,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_COMPETITION_REPO: process.env.GITHUB_COMPETITION_REPO,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
    SUPABASE_OAUTH_CLIENT_ID: process.env.SUPABASE_OAUTH_CLIENT_ID,
    SUPABASE_OAUTH_CLIENT_SECRET: process.env.SUPABASE_OAUTH_CLIENT_SECRET,
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
