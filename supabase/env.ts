/**
 * The Supabase CLI's environment manifest. These variables belong to no app —
 * they are read by `config.toml`'s `env(...)` substitutions and by the CLI
 * commands themselves (`supabase link`, `db push`) — so they are declared
 * here, next to the config that reads them, rather than in any `src/env.ts`
 * or in `packages/` (contributors must never have to edit `packages/` to add
 * a variable).
 *
 * NOTHING IMPORTS THIS FILE. Like the Flutter app's manifest it exists for
 * tooling to read; the sibling `tsconfig.json` (checked via
 * `@devdogsuga/supabase`'s typecheck script) is what keeps the metadata
 * honest.
 *
 * ⚠️ `env(FOO)` in config.toml is substituted only when it is the ENTIRE
 * value — the CLI matches it anchored — which is why the callbacks are their
 * own variables rather than `"env(BASE_URL)/auth/callback"`.
 */
import { declare, define, type EnvMeta } from "@devdogsuga/env";
import { z } from "zod";

/**
 * One OAuth provider pair, since all four are classified identically: the id
 * travels in the clear on every authorization redirect, so it is an
 * identifier; only the secret is a secret.
 *
 * ⚠️ Leave a provider UNSET (commented out) to disable it locally. An EMPTY
 * value for an enabled provider makes the CLI fail with
 * `ProjectConfigParseError` — hence `.optional()` rather than a default.
 */
const provider = (name: string, idExample?: string) => {
  const id: EnvMeta = {
    doc: `OAuth client id for the ${name} provider in config.toml. Unset disables the provider locally; an EMPTY value makes the Supabase CLI fail with ProjectConfigParseError.`,
    scope: "environment",
    secrecy: "public",
    commented: true,
  };
  if (idExample !== undefined) id.example = idExample;
  return {
    id: define(z.string().min(1).optional(), id),
    secret: define(z.string().min(1).optional(), {
      doc: `OAuth client secret for the ${name} provider in config.toml. Unset disables the provider locally.`,
      scope: "environment",
      secrecy: "secret",
      commented: true,
    } as const),
  };
};

const discord = provider("Discord");
const github = provider("GitHub");
// The example preserves the id's shape — the one OAuth client id whose format
// people second-guess when pasting from the Google console.
const google = provider(
  "Google",
  "000000000000-xxxx.apps.googleusercontent.com",
);
const linkedin = provider("LinkedIn");

declare({
  source: "supabase",
  server: {
    // The remote project. PROJECT_REF appears in every project URL the
    // browser talks to, so it is an identifier, not a secret (and it is in
    // the never-secret set for exactly that reason).
    PROJECT_REF: define(z.string(), {
      doc:
        "The remote Supabase project ref, for supabase link and the derived " +
        "connection URLs. Appears in every project URL, so an identifier, " +
        "not a secret. Found under Project Settings in the Supabase " +
        "dashboard, like the rest of the remote-project block.",
      scope: "environment",
      secrecy: "public",
    }),
    SUPABASE_DB_PASSWORD: define(z.string().min(1).optional(), {
      doc:
        "Password for the Postgres postgres role, for non-interactive " +
        "supabase link / db push. Leave UNSET unless running remote " +
        "commands -- an empty value makes the CLI fail with " +
        "ProjectConfigParseError (it even breaks `gen types`).",
      scope: "environment",
      secrecy: "secret",
      commented: true,
    }),
    // auth.site_url and the redirect allowlist. BASE_URL is also declared by
    // the platform manifest, deliberately with the same classification --
    // duplicates must agree, and the completeness test asserts it.
    BASE_URL: define(z.url(), {
      doc:
        "The platform app's public URL, and config.toml's auth.site_url. " +
        "Defaults to http://localhost:3000 in development.",
      scope: "environment",
      secrecy: "public",
      example: "http://localhost:3000",
    }),
    SCHEDULE_BUILDER_URL: define(z.url(), {
      doc:
        "The schedule-builder app's public URL, reaching " +
        "auth.additional_redirect_urls via SCHEDULE_BUILDER_URL_CALLBACK. " +
        "Branded Dog Days: https://dogdays.dev in production, " +
        "https://staging.dogdays.dev in staging -- keep in step with the " +
        "routes in apps/schedule-builder/wrangler.jsonc, which nothing " +
        "cross-checks.",
      scope: "environment",
      secrecy: "public",
      example: "http://localhost:3001",
    }),
    STUDY_GROUP_FINDER_URL: define(z.url().optional(), {
      doc:
        "The study-group-finder's public web URL, once it has one -- " +
        "branded Dog Pack, https://dogpack.dev. No web deployment exists " +
        "yet (the app is Flutter, validated as a web build only), so this " +
        "is declared ahead of it: the auth redirect allowlist is deployment " +
        "configuration, and registering the origin is what makes the first " +
        "web deploy a value-fill rather than a config change. Optional, and " +
        "an unset env() in config.toml is a WARN, not an error -- leave it " +
        "unset until the deploy exists.",
      scope: "environment",
      secrecy: "public",
      commented: true,
    }),
    BASE_URL_CALLBACK: define(z.url(), {
      doc:
        "BASE_URL plus /auth/callback. Its own variable because the CLI " +
        "substitutes env() only when it is the entire value, never inside a " +
        "larger string.",
      scope: "environment",
      secrecy: "public",
      example: "$BASE_URL/auth/callback",
    }),
    SCHEDULE_BUILDER_URL_CALLBACK: define(z.url(), {
      doc:
        "SCHEDULE_BUILDER_URL plus /auth/callback. Its own variable because " +
        "the CLI substitutes env() only when it is the entire value, never " +
        "inside a larger string.",
      scope: "environment",
      secrecy: "public",
      example: "$SCHEDULE_BUILDER_URL/auth/callback",
    }),
    STUDY_GROUP_FINDER_URL_CALLBACK: define(z.url().optional(), {
      doc:
        "STUDY_GROUP_FINDER_URL plus /auth/callback, in the redirect " +
        "allowlist for the future Dog Pack web deploy. Same shape as the " +
        "other *_CALLBACK pair; same reason it is its own variable. Leave " +
        "unset until the deploy exists.",
      scope: "environment",
      secrecy: "public",
      example: "$STUDY_GROUP_FINDER_URL/auth/callback",
      commented: true,
    }),
    // The four OAuth providers wired in config.toml's [auth.external.*]
    // blocks.
    DISCORD_CLIENT_ID: discord.id,
    DISCORD_CLIENT_SECRET: discord.secret,
    GH_CLIENT_ID: github.id,
    GH_CLIENT_SECRET: github.secret,
    GOOGLE_CLIENT_ID: google.id,
    GOOGLE_CLIENT_SECRET: google.secret,
    LINKEDIN_CLIENT_ID: linkedin.id,
    LINKEDIN_CLIENT_SECRET: linkedin.secret,
  },
});
