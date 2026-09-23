/**
 * The operator manifest: keys no app schema reads. They belong to the person
 * running devtools, pushing secrets, deploying.
 *
 * NOTHING IMPORTS THIS FILE at runtime. Like the other package-root manifests
 * it exists for the registry's consumers: the completeness test, the
 * `.env.example` generator, the `env push` routing. The package's `typecheck`
 * script is what keeps the metadata honest.
 *
 * This is also where the `never-store` credential is declared, and the
 * classification is the whole point. It is the most sensitive value in the
 * repository, refused storage because storing it defeats the thing it
 * protects. See the long-form reasoning in `src/bws/environments.ts`.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "devtools",
  server: {
    // Everything here is optional: these are operator credentials, and an
    // app or CI that cannot boot without one of them would be wrong.
    // Presence is checked at the point of use, with a named refusal.
    //
    // Local .env storage was refused here until 2026-08-19 and is now
    // OFFERED (the prompt's default save destination), by decision. What
    // held, holds: the refusals that matter are the REMOTE ones. `env push`
    // refuses this key by name, `pull` will not write it back, and `audit`
    // errors on any remote copy, because one
    // `${{ secrets.BWS_ACCESS_TOKEN }}` would hand CI every secret we hold,
    // and storing it in a Bitwarden project is a key locked inside the box
    // it opens. A gitignored .env on the operator's own machine is neither
    // store, and it already holds credentials of comparable reach after any
    // `env pull --target production`. Note `with-env` loads .env for every
    // wrapped command, dev servers included; the Password Manager vault
    // remains the save destination for anyone who minds that.
    BWS_ACCESS_TOKEN: define(z.string().min(1).optional(), {
      doc:
        "Unlocks every Bitwarden Secrets Manager project, so it must never " +
        "reach a remote store: never IN one of those projects (a key locked " +
        "inside the box it opens), never synced to GitHub (would hand CI " +
        "every secret we hold) -- push refuses it by name. Lives on the " +
        "operator's own machine: this file (the prompt offers to save it " +
        "here) or their Password Manager vault.",
      scope: "environment",
      secrecy: "never-store",
    }),
    SUPABASE_ACCESS_TOKEN: define(z.string().min(1).optional(), {
      doc:
        "A Supabase personal access token, carrying full account privileges " +
        "across both Supabase organizations. Only `supabase config push` " +
        "needs it -- the one mutation with no dry run -- so in GitHub it " +
        "reaches the production-apply environment only, behind required " +
        "reviewers.",
      scope: "environment",
      secrecy: "secret",
      tier: "apply",
      commented: true,
    }),
    // Devops-only, per the model doc. It appears in no contributor flow:
    // `pnpm dev`, `pnpm build` and every test suite run without it, so its
    // absence can never fail validation or block a boot.
    CLOUDFLARE_API_TOKEN: define(z.string().min(1).optional(), {
      doc:
        "Deploys Workers and sets bindings; only devops hold it. Deploy " +
        "scripts must check for it first and exit naming who to ask, rather " +
        "than falling into wrangler's interactive browser OAuth.",
      scope: "environment",
      secrecy: "secret",
      commented: true,
    }),
    // The value is committed as the example: one account, public identifier
    // (it is in every dashboard URL), same in every environment.
    CLOUDFLARE_ACCOUNT_ID: define(
      z
        .string()
        .regex(/^[0-9a-f]{32}$/)
        .optional(),
      {
        doc:
          "The Cloudflare account the Workers live in. OpenNext's R2 cache " +
          "provisioning reads it from the environment and cannot infer it " +
          "from the scoped CLOUDFLARE_API_TOKEN (the first staging deploy " +
          "hung on exactly that); wrangler honors it too. Identifies, does " +
          "not authorize — every capability is the token's.",
        scope: "default",
        secrecy: "public",
        example: "61d185ff419ef7bd5bd4b3d314081a49",
      },
    ),
    // Developer-scoped even though the VALUE is org-wide: only operators
    // running `env pull/push/audit` on their own machines read it, no app and
    // no CI job does, and developer scope is what keeps a purely local input
    // out of every routed set. A public identifier: it names the org and
    // authorizes nothing, every capability comes from BWS_ACCESS_TOKEN.
    BWS_ORG_ID: define(z.uuid().optional(), {
      doc:
        "The Bitwarden organization id, needed since the Secrets Manager " +
        "SDK replaced the bws binary (2026-08-19): every SDK call addresses " +
        "the org explicitly, and nothing in its surface discovers it from " +
        "the token. A public UUID -- it is in the Secrets Manager URL " +
        "(bitwarden.com/#/sm/<org-id>/...) -- that identifies and does not " +
        "authorize. Leave it unset and the first Secrets Manager command " +
        "asks, then saves it here.",
      scope: "developer",
      secrecy: "public",
    }),
    DEV_VPN_HOST: define(z.string().min(1).optional(), {
      doc:
        "One machine's VPN IP, for testing on a phone over VPN (the HMR " +
        "origin). Meaningless to anyone else, so never pushed anywhere.",
      scope: "developer",
      secrecy: "public",
    }),
    SKIP_ENV_VALIDATION: define(z.string().optional(), {
      doc:
        "Any non-empty value skips env-schema validation, for builds that " +
        "run without secrets -- CI and Docker. Never set it locally: it " +
        "turns misconfiguration from a build error into a runtime surprise.",
      scope: "default",
      secrecy: "public",
      commented: true,
    }),
    // Same contract as the four apps' *_SENTRY_DSN (see
    // `@devdogsuga/telemetry`'s no-op-without-DSN guarantee): optional,
    // empty means `src/telemetry.ts` never calls `Sentry.init`. Committed
    // as a `PLACEHOLDER_DEVTOOLS_SENTRY_DSN` constant in that file until the
    // devtools Sentry project exists; this variable, when set, always wins
    // over that placeholder. `scope: "environment"` because the CI job that
    // reports as `environment: "ci"` needs the same value a contributor's
    // machine (`environment: "local"`) does -- there is no per-deploy-tier
    // split the way `DEPLOY_ENV` has, only per-target routing.
    DEVTOOLS_SENTRY_DSN: define(z.string().url().optional(), {
      doc:
        "Sentry ingest DSN for the devtools project. Optional -- empty " +
        "skips Sentry.init entirely, which is the state before the org is " +
        "onboarded and the state of local development. See " +
        "src/telemetry.ts.",
      scope: "environment",
      secrecy: "public",
    }),
    // Reporting is ON by default once DEVTOOLS_SENTRY_DSN is set -- unlike
    // every other telemetry surface in this workspace, which a consumer
    // opts INTO by configuring a DSN, this one an operator opts OUT of.
    // `"0"` is the one recognized value; anything else, including unset,
    // leaves reporting on. Developer-scoped: it is a per-machine (or
    // per-job) preference, never something `env push` should route
    // anywhere.
    DEVTOOLS_TELEMETRY: define(z.string().optional(), {
      doc:
        'Set to "0" to opt out of devtools\' Sentry error reporting (on by ' +
        "default whenever DEVTOOLS_SENTRY_DSN is configured). See " +
        "src/telemetry.ts.",
      scope: "developer",
      secrecy: "public",
    }),
  },
});
