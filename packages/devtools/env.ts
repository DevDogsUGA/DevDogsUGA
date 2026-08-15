/**
 * The operator/tooling manifest: keys no app schema reads. They belong to the
 * person running devtools — pushing secrets, scaffolding Airtable, deploying —
 * so they live with the operator surface rather than in any app's `env.ts`.
 *
 * NOTHING IMPORTS THIS FILE at runtime. Like the other package-root
 * manifests it exists for the registry's consumers — the completeness test,
 * the `.env.example` generator, the `secrets push` routing — and the
 * package's `typecheck` script is what keeps the metadata honest.
 *
 * This is also where the two `never-store` credentials are declared, and the
 * classification is the entire point: they are the MOST sensitive values in
 * the repository, refused storage precisely because storing them defeats the
 * thing they protect. See the long-form reasoning in `src/bws/environments.ts`.
 */
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

declare({
  source: "devtools",
  server: {
    // Everything here is optional: these are operator credentials, and an
    // app -- or CI -- that cannot boot without one of them would be wrong.
    // Presence is checked at the point of use, with a named refusal.
    BWS_ACCESS_TOKEN: define(z.string().min(1).optional(), {
      doc:
        "Unlocks every Bitwarden Secrets Manager project, so it must never " +
        "be stored in one (a key locked inside the box it opens) nor synced " +
        "to GitHub (would hand CI every secret we hold). Lives in the " +
        "operator's Password Manager vault and reaches the shell as an " +
        "export.",
      scope: "environment",
      secrecy: "never-store",
    }),
    AIRTABLE_PAT: define(z.string().min(1).optional(), {
      doc:
        "Bootstrap-only Airtable token for the scaffolding scripts, which " +
        "run before there is anywhere to put a secret. The runtime reads " +
        "its own narrower token from Supabase Vault; this one stays in the " +
        "operator's vault, in .env only while shaping the base.",
      scope: "developer",
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
    }),
    AIRTABLE_APPLY_PAT: define(z.string().min(1).optional(), {
      doc:
        "Write-capable Airtable token that can restructure the officers' " +
        "base. Routed to the production-apply GitHub environment only, " +
        "behind required reviewers.",
      scope: "environment",
      secrecy: "secret",
      tier: "apply",
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
    }),
  },
});
