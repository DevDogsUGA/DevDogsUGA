/**
 * The sandbox Worker's environment manifest.
 *
 * NOTHING IMPORTS THIS FILE, and the Worker never will. `src/index.ts` reads
 * its configuration from the `Env` argument workerd hands `fetch()`, not from
 * `process.env`, so there is no `createEnv` here and no boot that this file
 * could fail. Like `packages/devtools/env.ts` and `apps/study-group-finder/
 * env.ts` it exists for the registry's consumers -- the completeness test, the
 * `.env.example` generator, `env push` routing, and `env audit`. The
 * sibling `tsconfig.json` names it explicitly, which is what keeps the metadata
 * typechecked.
 *
 * ## Why this file now exists, when `discovery.ts` used to say it never would
 *
 * The old reasoning was: bindings arrive as a function argument, so a manifest
 * would describe nothing. That is true of the RUNTIME and false of everything
 * else. Two concrete failures followed from the absence:
 *
 *   1. `env audit` reports any Worker secret it cannot find in Bitwarden as
 *      an orphan, and the plan doc's §3.6 prune path deletes orphans on
 *      `workflow_dispatch`. `SANDBOX_PROXY_TOKEN` is minted, so it is in no
 *      Bitwarden project by design -- which made the live proxy credential
 *      indistinguishable from a leftover from a rename. The audit was
 *      recommending its deletion.
 *   2. `SUPABASE_JWT_SIGNING_KEY` had no route to the `production` GitHub
 *      environment, because routing is derived from declarations. An
 *      undeclared deploy credential is one CI cannot see.
 *
 * The manifest is how both become visible. It changes nothing about how the
 * Worker reads its bindings.
 *
 * ⚠️ `zod` is resolved from the repository root's devDependency rather than
 * from this package's own -- `apps/sandbox/package.json` does not list it, and
 * adding it was deferred because it means a lockfile change. `supabase/env.ts`
 * already relies on the root copy for the same reason (it is not a workspace
 * package at all), so this works today; add `"zod": "catalog:"` to this
 * package's devDependencies the next time the lockfile is touched.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "sandbox",
  server: {
    // Everything here is `.optional()`. No app boots on these: the Worker
    // checks its two bindings itself and answers 503 `proxy_misconfigured`
    // when either is missing, and the signing key is checked by
    // `devtools deploy mint-token` with a named refusal. A required
    // schema here would only break CI, which holds none of them.

    // ── Decided here rather than in wrangler.jsonc ──────────────────────────
    // The plan doc left this open ("`PLATFORM_REST_URL`: `wrangler.jsonc` var
    // or registry entry"), and the committed file answered it by accident: all
    // three environments carried the literal
    // `https://REPLACE_ME.supabase.co/rest/v1`. That is the whole argument. A
    // committed `vars` entry is one value for three environments, so the only
    // way to make it correct is to edit it by hand per deploy -- and the
    // placeholder surviving in `production` is the measurement of how often
    // that happens.
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

    // ── The credential this whole file exists for ──────────────────────────
    // A JWT carrying {"role": "sandbox_proxy"}, signed with the platform
    // project's own signing key by `devtools deploy mint-token`.
    //
    // NOT a Supabase secret key, and the distinction is the security property:
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
        "SIGNED at deploy time from SUPABASE_JWT_SIGNING_KEY and written " +
        "straight to the Worker. There is no stored copy anywhere -- not " +
        "here, not in Bitwarden, not in GitHub -- because minting is signing " +
        "rather than an API call, which is what makes rotating it on every " +
        "deploy free. 90-day exp, so a pipeline that goes stale fails loudly.",
      scope: "environment",
      secrecy: "secret",
      minted: true,
    }),
  },
});

/**
 * What mints the token -- and a SEPARATE source, which is the whole point.
 *
 * `devtools deploy secrets-file` sends a Worker every storable key its app
 * declares, and excludes `:tooling` sources precisely because "a key the
 * DEPLOY needs is not automatically a key the WORKER needs". Declared as plain
 * `sandbox`, this key rode that path onto the proxy Worker itself.
 *
 * That is the exact inversion this file's own comments argue against. The
 * signing key mints a token for ANY role, `service_role` included;
 * `sandbox_proxy` was built to hold EXECUTE on two functions and no table
 * grants. Uploading the former to the Worker restricted to the latter hands an
 * internet-facing proxy the means to escalate itself to everything, and it
 * would sit there as a Cloudflare secret long after the deploy that wrote it.
 *
 * The trust argument that justifies CI holding it -- whoever deploys
 * `apps/platform` can already read `SECRET_KEY` from its own environment, so a
 * pipeline deploying both Workers gains no authority it lacked -- is about the
 * PIPELINE. It says nothing about the Worker, which is a different principal
 * with a much longer-lived and more exposed store. Keep the two apart: the
 * mint script runs on the runner, the token is what reaches the edge.
 *
 * Still declared here rather than in the devtools operator manifest, because
 * minting that token is its only use in this repository and a reader of
 * `.env.example` should find the whole rotation path in one place -- the
 * endpoint, the minted token, and the key that signs it. `:tooling` sources
 * fold into their app's section when the example is rendered, so that holds.
 *
 * If the proxy ever moves to a separate, less-trusted pipeline, this key does
 * NOT follow it and the token goes back to being minted out of band.
 */
declare({
  source: "sandbox:tooling",
  server: {
    SUPABASE_JWT_SIGNING_KEY: define(z.string().min(32).optional(), {
      doc:
        "The platform Supabase project's JWT signing secret (HS256), used by " +
        "devtools deploy mint-token to sign SANDBOX_PROXY_TOKEN at " +
        "deploy time. ⚠️ It can mint a token for ANY role, including a " +
        "user session -- it is the widest credential in this file by a long " +
        "way, and it is here only because the sandbox token is the one thing " +
        "signed with it. Devops-only. Mint the secret yourself, store it " +
        "here, and IMPORT it as a shared-secret key on the project's JWT " +
        "signing keys page -- never let Supabase generate it: keys in that " +
        "system cannot be extracted afterwards, so an imported copy is the " +
        "only way this side can hold the signing half. The legacy JWT " +
        "secret is deprecated with no announced removal date; the imported " +
        "shared secret is the path that outlives it. After migrating a " +
        "project to signing keys, verify the sandbox token still resolves " +
        "-- PostgREST v13 tightened custom-JWT validation (2025-07) and " +
        "some migrated projects needed the key re-imported.",
      scope: "environment",
      secrecy: "secret",
      commented: true,
    }),
  },
});
