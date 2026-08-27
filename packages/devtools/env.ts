/**
 * The operator/tooling manifest: keys no app schema reads. They belong to the
 * person running devtools — pushing secrets, scaffolding Airtable, deploying —
 * so they live with the operator surface rather than in any app's `env.ts`.
 *
 * NOTHING IMPORTS THIS FILE at runtime. Like the other package-root
 * manifests it exists for the registry's consumers — the completeness test,
 * the `.env.example` generator, the `env push` routing — and the
 * package's `typecheck` script is what keeps the metadata honest.
 *
 * This is also where the `never-store` credential is declared, and the
 * classification is the entire point: it is the MOST sensitive value in the
 * repository, refused storage precisely because storing it defeats the thing
 * it protects. See the long-form reasoning in `src/bws/environments.ts`.
 *
 * There were two until `AIRTABLE_PAT` was removed. It was the bootstrap
 * Airtable token, and it earned `never-store` by carrying `schema.bases:write`
 * on an operator's laptop — which is also why it stopped earning a
 * declaration at all: `deploy airtable-apply` does that write behind required
 * reviewers, and every other command it served needs only a read. Creating a
 * base from nothing still needs a person and a token, but that is a one-off
 * with a documented revoke rather than a key the registry carries.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "devtools",
  server: {
    // Everything here is optional: these are operator credentials, and an
    // app -- or CI -- that cannot boot without one of them would be wrong.
    // Presence is checked at the point of use, with a named refusal.
    //
    // Local .env storage was refused here until 2026-08-19 and is now
    // OFFERED (the prompt's default save destination), by decision. What
    // held, holds: the refusals that matter are the REMOTE ones -- `env
    // push` refuses this key by name, `pull` will not write it back, and
    // `audit` errors on any remote copy -- because one
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
    // The narrowest of the three Airtable tokens, and the only one CI may
    // hold outside the reviewer gate. §3.5's stage-1 dry run answers "what
    // would this commit do to the base" from `main`, so whatever it
    // authenticates with is reachable from the `main` trust tier -- which
    // rules out AIRTABLE_SYNC_PAT (it can rewrite every record) and rules out
    // AIRTABLE_APPLY_PAT (that is what the reviewer gate is for). A token
    // that can read a schema and do nothing else is what is left.
    //
    // It also ruled out AIRTABLE_PAT, the write-capable bootstrap token, until
    // that key was removed outright -- so the argument now has one fewer
    // candidate to reject rather than a different conclusion.
    //
    // ⚠️ `narrowed: true` here is the SECOND shape of that marker, not the
    // DB_URL one. There is no wider credential under this name in any target
    // -- the scope split is between three separate declarations rather than
    // three values of one key -- so nobody has to remember to mint a weaker
    // variant for preflight. See `EnvMeta.narrowed` for both shapes and for
    // what marking a key wrongly costs.
    //
    // `tier: "plan"`, deliberately: it reaches `preflight` (where `main-plan`
    // runs, via the `narrowed` opt-in) and `production` (where
    // `production-plan` runs) and nothing else. The default tier used to send
    // it to staging as well, where no job reads it — a read-only spare to
    // rotate, not a privilege, but a spare with no purpose. `tier: "apply"`
    // would be wrong in the other direction: production-apply ALONE, the one
    // environment the plan never runs in.
    AIRTABLE_PLAN_PAT: define(z.string().min(1).optional(), {
      doc:
        "Read-only Airtable token for the schema dry run: `schema.bases:read` " +
        "on the officers' base and nothing else. Probed against the live " +
        "base -- a records read and a schema write both answered 403 -- so a " +
        "job holding it can report what a promotion would do to the base and " +
        "cannot do it. This is the credential the plan step on `main` uses, " +
        "which is why it must stay unable to read a single record.",
      scope: "environment",
      secrecy: "secret",
      tier: "plan",
      narrowed: true,
      commented: true,
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
    AIRTABLE_APPLY_PAT: define(z.string().min(1).optional(), {
      doc:
        "Write-capable Airtable token that can restructure the officers' " +
        "base. Routed to the production-apply GitHub environment only, " +
        "behind required reviewers.",
      scope: "environment",
      secrecy: "secret",
      tier: "apply",
      commented: true,
    }),
    // Devops-only, per the model doc: it appears in no contributor flow --
    // `pnpm dev`, `pnpm build` and every test suite run without it -- so its
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
    // out of every routed set. A public identifier — it names the org and
    // authorizes nothing; every capability comes from BWS_ACCESS_TOKEN.
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
  },
});
