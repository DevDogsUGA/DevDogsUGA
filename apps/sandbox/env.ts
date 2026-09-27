/**
 * The sandbox Worker's environment manifest.
 *
 * NOTHING IMPORTS THIS FILE, and the Worker never will. `src/index.ts` reads
 * its configuration from the `Env` argument workerd hands `fetch()`, not from
 * `process.env`, so there is no `createEnv` here and no boot that this file
 * could fail. Like `apps/study-group-finder/env.ts` it exists for the
 * registry's consumers: the completeness test, the `.env.example` generator,
 * `env push` routing, and `env audit`. (Devtools' own operator-tooling
 * manifest used to be a third example of this same pattern — `packages/
 * devtools/env.ts` — but that package moved to Backstage in the devtools
 * cutover and its env vars are no longer part of THIS repo's registry at
 * all; they're the CLI's own concern now, configured on a contributor's
 * machine, not routed through `.env.example`/`env push` here.) The sibling
 * `tsconfig.json` names it explicitly, which is what keeps the metadata
 * typechecked.
 *
 * ## Why this manifest exists despite no boot reading it
 *
 * Bindings arrive as a function argument, so at runtime a manifest describes
 * nothing. Two other consumers still need it to exist:
 *
 *   1. `env audit` reports any Worker secret it cannot find in Bitwarden as
 *      an orphan, and the plan doc's §3.6 prune path deletes orphans on
 *      `workflow_dispatch`. `SANDBOX_PROXY_TOKEN` is minted, so by design it
 *      is in no Bitwarden project, which would make the live proxy credential
 *      indistinguishable from a leftover from a rename without this manifest
 *      declaring it `minted: true`.
 *   2. `SUPABASE_JWT_SIGNING_KEY` needs a route to the `production` GitHub
 *      environment, because routing is derived from declarations. An
 *      undeclared deploy credential is one CI cannot see.
 *
 * The manifest is how both become visible. It changes nothing about how the
 * Worker reads its bindings.
 *
 * ⚠️ `zod` is resolved from the repository root's devDependency rather than
 * from this package's own: `apps/sandbox/package.json` does not list it, and
 * adding it was deferred because it means a lockfile change. `supabase/env.ts`
 * already relies on the root copy for the same reason (it is not a workspace
 * package at all), so this works today; add `"zod": "catalog:"` to this
 * package's devDependencies the next time the lockfile is touched.
 */
import { DEPLOY_ENVIRONMENTS, declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "sandbox",
  server: {
    // Everything here is `.optional()`. No app boots on these: the Worker
    // checks its two bindings itself and answers 503 `proxy_misconfigured`
    // when either is missing. Nothing checks the signing key separately, so
    // a required schema here would only break CI, which holds none of them.

    // Which deployment this is, read by `src/index.ts` only to become the
    // Sentry `environment` tag it passes to `buildSentryOptions`. Same key,
    // same meta, as `apps/platform/src/env.ts`'s declaration -- duplicate
    // declarations of one registry key must agree on every field, doc string
    // included (`completeness.test.ts` enforces this), so this is a copy of
    // that one rather than an independently worded restatement. Committed by
    // `wrangler.jsonc`'s top-level `vars` and each `env.<tier>.vars` block
    // here, exactly as it says.
    DEPLOY_ENV: define(z.enum(DEPLOY_ENVIRONMENTS).default("development"), {
      doc:
        "Which deployment this is: development, staging, or production. Never " +
        "written into an env file -- wrangler.jsonc's per-env blocks and the " +
        "cf:build:* scripts are its two committed sources.",
      scope: "default",
      secrecy: "public",
      commented: true,
    }),

    // ── Decided here rather than in wrangler.jsonc ──────────────────────────
    // The plan doc left this open ("`PLATFORM_REST_URL`: `wrangler.jsonc` var
    // or registry entry"), and the committed file answered it by accident: all
    // three environments carried the literal
    // `https://REPLACE_ME.supabase.co/rest/v1`. A committed `vars` entry is one
    // value for three environments, so the only way to make it correct is to
    // edit it by hand per deploy, and the placeholder surviving in `production`
    // measures how often that happens.
    //
    // It is per-environment, so it is a registry entry, delivered as
    // `--var PLATFORM_REST_URL:$REST_URL` at deploy time from the same env
    // file every other deployed value comes from. `$REST_URL` is not a
    // placeholder: dotenvx expands it, and the platform project's PostgREST
    // endpoint is exactly what this is.
    //
    // Public, for the same reason `REST_URL` is: it is derived from
    // PROJECT_REF and reaching it still requires a credential.
    PLATFORM_REST_URL: define(z.string().min(1).optional(), {
      doc:
        "The PLATFORM project's PostgREST endpoint, as seen by the sandbox " +
        "Worker -- not a sandbox's own. It is how the Worker asks the " +
        "platform who a member token belongs to, so a wrong value makes " +
        "every proxied request fail to resolve. Delivered to the Worker as a " +
        "wrangler --var at deploy time; the same value as REST_URL for the " +
        "environment being deployed.",
      scope: "environment",
      secrecy: "public",
      example: "$REST_URL",
    }),

    // Sentry ingest DSN for the "sandbox" project (see @devdogsuga/telemetry).
    // Ordinary registry variable, NOT the `PLATFORM_REST_URL` special case
    // above: it is the same value in every environment (one Sentry project
    // per app; `production` vs `staging` is the `environment` tag, not a
    // different DSN), so it is stored and reaches the Worker the same way
    // `apps/platform/src/env.ts` and `apps/schedule-builder/src/env.ts`
    // deliver theirs -- Bitwarden -> `env push` -> `deploy secrets-file` ->
    // `wrangler deploy --secrets-file`. Optional and empty by default: the
    // org is not onboarded in every environment yet, and `buildSentryOptions`
    // treats a falsy DSN as "skip Sentry.init entirely" -- no init, no
    // network calls, no console noise, which matches local `wrangler dev`
    // too. A DSN is not a secret (it identifies a project, not a credential
    // -- anyone can only submit events, never read them).
    // Prefixed with the app, unlike most keys here: every app has its own
    // Sentry project, and a deploy environment holds one value per name, so a
    // shared SENTRY_DSN would send every app's events to one project (and the
    // release step uploads each app's source maps to its own project).
    SANDBOX_SENTRY_DSN: define(z.string().url().optional(), {
      doc:
        "Sentry ingest DSN for this app's Sentry project (see " +
        "@devdogsuga/telemetry). Optional -- empty skips Sentry.init " +
        "entirely, which is the state before the org is onboarded and the " +
        "state of local development. Reaches the Worker like every other " +
        "environment variable.",
      scope: "environment",
      secrecy: "public",
    }),

    // ── The credential this whole file exists for ──────────────────────────
    // A JWT carrying {"role": "sandbox_proxy"}, signed with the platform
    // project's own signing key. Nothing in this repository mints this
    // value.
    //
    // NOT a Supabase secret key, and that distinction is the security property.
    // `sb_secret_...` keys authorize as `service_role` and cannot be bound to
    // a custom role, so one here would hand the Worker read access to every
    // table in the platform database. `sandbox_proxy` holds EXECUTE on exactly
    // two functions and no table grants at all (migration
    // 20260805000002_platform_sandbox_credentials.sql).
    //
    // `minted: true` is what tells `env push` never to upload it and
    // `env audit` that its absence from Bitwarden is correct rather than a
    // rename left behind. See the long-form reasoning on `EnvMeta.minted`.
    SANDBOX_PROXY_TOKEN: define(z.string().min(1).optional(), {
      doc:
        "The sandbox Worker's credential for resolve_sandbox_credential and " +
        'log_proxy_request: a JWT carrying {"role": "sandbox_proxy"}, ' +
        "signed with SUPABASE_JWT_SIGNING_KEY. Nothing in this repository " +
        "mints this value. Still declared `minted: true` so `env audit` " +
        "keeps reading its absence from Bitwarden as correct rather than a " +
        "rename left behind; see the reasoning on `EnvMeta.minted`.",
      scope: "environment",
      secrecy: "secret",
      minted: true,
    }),
  },
});

/**
 * The key that could mint the token, kept in a SEPARATE source, which is the
 * whole point.
 *
 * `devtools deploy secrets-file` sends a Worker every storable key its app
 * declares, and excludes `:tooling` sources because "a key the DEPLOY needs is
 * not automatically a key the WORKER needs". Declared as plain `sandbox`, this
 * key would ride that path onto the proxy Worker itself.
 *
 * That would be the exact inversion this file's own comments argue against.
 * The signing key mints a token for ANY role, `service_role` included;
 * `sandbox_proxy` holds EXECUTE on two functions and no table grants.
 * Uploading the former to the Worker restricted to the latter would hand an
 * internet-facing proxy the means to escalate itself to everything, and it
 * would sit there as a Cloudflare secret long after the deploy that wrote it.
 *
 * The trust argument for CI holding it is about the PIPELINE: whoever deploys
 * `apps/platform` can already read `SECRET_KEY` from its own environment, so a
 * pipeline deploying both Workers gains no authority it lacked. It says
 * nothing about the Worker, a different principal with a much longer-lived
 * and more exposed store. The two stay apart: a mint would run on the runner,
 * the token would reach the edge.
 *
 * Nothing in this repository mints a token from this key.
 *
 * Still declared here rather than in the devtools operator manifest, so a
 * reader of `.env.example` finds the whole rotation path in one place -- the
 * endpoint, the minted token, and the key that would sign it. `:tooling`
 * sources fold into their app's section when the example is rendered, so that
 * still holds.
 */
declare({
  source: "sandbox:tooling",
  server: {
    SUPABASE_JWT_SIGNING_KEY: define(z.string().min(32).optional(), {
      doc:
        "The platform Supabase project's JWT signing secret (HS256), which " +
        "would sign SANDBOX_PROXY_TOKEN. ⚠️ It can mint a token for ANY " +
        "role, including a user session -- the widest credential in this " +
        "file by a long way, kept here only because SANDBOX_PROXY_TOKEN is " +
        "the one thing it would sign. Nothing in this repository mints or " +
        "imports this value; leaving it blank is correct until a " +
        "replacement integration needs it.",
      scope: "environment",
      secrecy: "secret",
      commented: true,
    }),
  },
});
