/**
 * The environments whose secrets live in Bitwarden, and which project backs each.
 *
 * **Bitwarden is the source of truth, and CI never reads it.** Values are
 * curated in the local `.env` and sent onward by `pnpm devtools secrets push`,
 * which writes Bitwarden AND the GitHub environment secrets in one go. Deploy
 * jobs then read `${{ secrets.* }}` like any other workflow.
 *
 * That one decision sets the whole budget. Because nothing machine-shaped ever
 * authenticates to Secrets Manager, there are **no CI machine accounts** — just
 * one `admin` account, held by a person, read/write on all three projects:
 *
 *   | Used | Free plan |
 *   |------|-----------|
 *   | 3 projects — preflight, staging, production | 3 |
 *   | 1 machine account — `admin` | 3 |
 *
 * Two machine accounts spare, where the previous shape had none and could not
 * afford a project for `preflight`.
 *
 * What the sync costs is a second copy that cannot be read back: GitHub secrets
 * are write-only, so `secrets audit` compares names and `updatedAt` against
 * each secret's `revisionDate` here. That catches the realistic failure — a
 * rotation pushed to Bitwarden and never propagated — without ever comparing
 * values.
 *
 * What it buys: no `bws` binary and no Bitwarden network call in the deploy
 * path, and `${{ secrets.* }}` is masked in workflow logs automatically, which
 * a value pulled at run time is not unless somebody remembers `::add-mask::`.
 */

export const ENVIRONMENTS = ["preflight", "staging", "production"] as const;
export type BwsEnvironment = (typeof ENVIRONMENTS)[number];

export function isEnvironment(value: string): value is BwsEnvironment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}

export interface EnvironmentSpec {
  /** BWS project name. Resolved to a UUID at run time, never committed. */
  project: string;
  /** Extra confirmation before writing. */
  guarded: boolean;
  summary: string;
}

/**
 * Project *names*, not ids.
 *
 * A project id is a UUID that means nothing without a token, so committing one
 * would leak nothing — but it would rot. Ids change when a project is recreated
 * (which is exactly what happens after a botched rotation), and a stale id fails
 * as "project not found" rather than as anything actionable. Resolving by name
 * costs one API call and cannot go stale silently.
 */
export const ENVIRONMENT_SPECS: Record<BwsEnvironment, EnvironmentSpec> = {
  preflight: {
    project: "devdogs-preflight",
    guarded: false,
    summary:
      "Credentials for the dry runs that precede a promotion to production. " +
      "Read-only by construction: a Postgres role that can see only the " +
      "migrations table, and an Airtable PAT with schema:read and nothing else.",
  },
  staging: {
    project: "devdogs-staging",
    guarded: false,
    summary: "Everything the two Next apps consume, pointed at staging.",
  },
  production: {
    project: "devdogs-production",
    guarded: true,
    summary:
      "The live values. Shared with the production-apply environment, which " +
      "is the same project behind required reviewers.",
  },
};

// ── Where the key sets went ──────────────────────────────────────────────────
//
// The hand-maintained arrays that used to live here — NEVER_STORE_KEYS,
// NEVER_SECRET_KEYS, APPLY_ONLY_KEYS — are now DERIVED from the declarations
// in each app's env manifest: `neverStoreKeys()`, `neverSecretKeys()`,
// `applyOnlyKeys()` and `storableKeys()` from `@devdogsuga/env`, populated by
// devtools' `env/discovery.ts` (`loadRegistry()`). The arrays were correct;
// what they could not do is STAY correct, because nothing connected them to
// the schemas they described — a key added to an `env.ts` and not here was
// pushed to Bitwarden as a secret by omission.
//
// The reasoning moved with the keys, onto the declarations themselves:
//
//   * why `BWS_ACCESS_TOKEN` and `AIRTABLE_PAT` are refused storage anywhere
//     (a key locked inside the box it opens) — their `define()` docs and the
//     surrounding comments in `packages/devtools/env.ts`;
//   * why apply-tier is a GITHUB routing rule and not a Bitwarden one (the
//     production BWS project deliberately holds the apply credentials) — the
//     `EnvTier` doc in `packages/env/src/meta.ts`;
//   * why the apply pair stays out of staging/preflight — `ignoredFor()` in
//     `../env/selection.ts`.
