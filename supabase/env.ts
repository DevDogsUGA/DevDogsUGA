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
import { declare, define } from "@devdogsuga/env";
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
const provider = (name: string) => ({
  id: define(z.string().min(1).optional(), {
    doc: `OAuth client id for the ${name} provider in config.toml. Unset disables the provider locally; an EMPTY value makes the Supabase CLI fail with ProjectConfigParseError.`,
    scope: "environment",
    secrecy: "public",
  } as const),
  secret: define(z.string().min(1).optional(), {
    doc: `OAuth client secret for the ${name} provider in config.toml. Unset disables the provider locally.`,
    scope: "environment",
    secrecy: "secret",
  } as const),
});

const discord = provider("Discord");
const github = provider("GitHub");
const google = provider("Google");
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
        "not a secret.",
      scope: "environment",
      secrecy: "public",
    }),
    SUPABASE_DB_PASSWORD: define(z.string().min(1).optional(), {
      doc:
        "Password for the Postgres postgres role, for non-interactive " +
        "supabase link / db push. Leave UNSET unless running remote " +
        "commands -- an empty value makes the CLI fail with " +
        "ProjectConfigParseError.",
      scope: "environment",
      secrecy: "secret",
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
    }),
    SCHEDULE_BUILDER_URL: define(z.url(), {
      doc:
        "The schedule-builder app's public URL, reaching " +
        "auth.additional_redirect_urls via SCHEDULE_BUILDER_URL_CALLBACK.",
      scope: "environment",
      secrecy: "public",
    }),
    BASE_URL_CALLBACK: define(z.url(), {
      doc:
        "BASE_URL plus /auth/callback. Its own variable because the CLI " +
        "substitutes env() only when it is the entire value, never inside a " +
        "larger string.",
      scope: "environment",
      secrecy: "public",
    }),
    SCHEDULE_BUILDER_URL_CALLBACK: define(z.url(), {
      doc:
        "SCHEDULE_BUILDER_URL plus /auth/callback. Its own variable because " +
        "the CLI substitutes env() only when it is the entire value, never " +
        "inside a larger string.",
      scope: "environment",
      secrecy: "public",
    }),
    // The four OAuth providers wired in config.toml's [auth.external.*]
    // blocks.
    DISCORD_CLIENT_ID: discord.id,
    DISCORD_CLIENT_SECRET: discord.secret,
    GITHUB_CLIENT_ID: github.id,
    GITHUB_CLIENT_SECRET: github.secret,
    GOOGLE_CLIENT_ID: google.id,
    GOOGLE_CLIENT_SECRET: google.secret,
    LINKEDIN_CLIENT_ID: linkedin.id,
    LINKEDIN_CLIENT_SECRET: linkedin.secret,
  },
});
