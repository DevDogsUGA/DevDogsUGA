/**
 * The targets whose values live in Bitwarden, and what backs each.
 *
 * ⚠️ DERIVED, NOT DECLARED. The list of vault targets and the project name for
 * each come from the one target table in `@devdogsuga/env`
 * (`packages/env/src/targets.ts`); only the prose summaries are added here.
 * This file used to declare its own `preflight | staging | production` enum
 * beside that package's `development | staging | production` one, both behind
 * a flag spelled `--env`, and the two agreeing on the words `staging` and
 * `production` is what let `push --env staging` read the development `.env`
 * while `init --env staging` wrote `.env.staging`. See the table's own comment
 * for the full account.
 *
 * **Bitwarden is the source of truth, and CI never reads it.** Values are
 * curated in a local env file and sent onward by `pnpm devtools env push`,
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
 * There are three projects and FOUR targets: `development` has none. `.env` is
 * one contributor's own file, there is no shared development credential set to
 * sync it against, and `pull`/`push`/`audit` refuse that target by name rather
 * than falling through to a default project.
 *
 * What the sync costs is a second copy that cannot be read back: GitHub secrets
 * are write-only, so `env audit` compares names and `updatedAt` against each
 * secret's `revisionDate` here. That catches the realistic failure — a
 * rotation pushed to Bitwarden and never propagated — without ever comparing
 * values.
 *
 * ⚠️ These projects hold the PUBLIC per-environment values too, not only the
 * secrets — `PROJECT_REF`, `BASE_URL`, `PUBLISHABLE_KEY` and the rest go on to
 * GitHub as *variables* rather than secrets. "Bitwarden is the source of truth"
 * has to be true of a whole target for `pull` to rebuild an env file an
 * app can boot from; while it was true of the secret half only, 27 values
 * existed nowhere but somebody's laptop. Variables ARE readable back, so for
 * those keys the audit compares values and the paragraph above does not apply.
 *
 * What it buys: no `bws` binary and no Bitwarden network call in the deploy
 * path, and `${{ secrets.* }}` is masked in workflow logs automatically, which
 * a value pulled at run time is not unless somebody remembers `::add-mask::`.
 */
import {
  VAULT_TARGETS,
  fileFor,
  isGuarded,
  isVaultTarget,
  projectFor,
  type EnvTarget,
  type VaultTarget,
} from "@devdogsuga/env";

export { VAULT_TARGETS, isVaultTarget, type VaultTarget };

export interface EnvironmentSpec {
  /** BWS project name. Resolved to a UUID at run time, never committed. */
  project: string;
  /** Extra confirmation before writing. */
  guarded: boolean;
  summary: string;
}

const SUMMARIES: Record<VaultTarget, string> = {
  preflight:
    "Credentials for the dry runs that precede a promotion to production. " +
    "Read-only by construction: a Postgres role that can see only the " +
    "migrations table, and an Airtable PAT with schema:read and nothing else.",
  staging: "Everything the two Next apps consume, pointed at staging.",
  production:
    "The live values. Shared with the production-apply environment, which " +
    "is the same project behind required reviewers.",
};

/**
 * Project *names*, not ids — see `TargetSpec.project` for why.
 *
 * Assembled from the target table rather than typed out again: a second copy
 * of "staging means devdogs-staging" is a copy that can disagree, and the
 * disagreement would be silent in exactly the direction that matters.
 */
export const ENVIRONMENT_SPECS = Object.fromEntries(
  VAULT_TARGETS.map((target) => [
    target,
    {
      // Non-null by construction: `VAULT_TARGETS` is the targets whose
      // `project` is not null.
      project: projectFor(target)!,
      guarded: isGuarded(target),
      summary: SUMMARIES[target],
    },
  ]),
) as Record<VaultTarget, EnvironmentSpec>;

/**
 * `--target development` reached `pull`, `push` or `audit`.
 *
 * Its own error rather than a lookup that returns `undefined`, because the old
 * shape of this mistake was silence: `development` was simply not in the vault
 * enum, so nothing named it and nothing said why. It is a real target with a
 * real file; what it does not have is a shared credential set to sync against.
 */
export class NoVaultProjectError extends Error {
  constructor(readonly target: EnvTarget) {
    super(
      `--target ${target} has no Bitwarden project, so there is nothing to ` +
        `pull from, push to, or audit against. ${fileFor(target)} is your own ` +
        `file — nobody else's copy is meant to match it.`,
    );
    this.name = "NoVaultProjectError";
  }
}

/** Said wherever the refusal is reported, so the advice cannot drift. */
export const NO_VAULT_PROJECT_HINTS = [
  `Pass --target ${VAULT_TARGETS.join(" | ")} instead.`,
  "`pnpm devtools env reset` blanks the values in a local file, keeping each",
  "recoverable as a comment. `pnpm devtools setup` creates a fresh .env.",
];

/**
 * Refuses the one target that has no project, and narrows the rest.
 *
 * Called at the top of every command that talks to a vault, so the refusal is
 * a property of the commands rather than of the argument parser alone — a new
 * subcommand that forgets to validate its flag still cannot fall through to a
 * default project. It narrows as well as throws, so everything after the call
 * is typed as a target that HAS a project rather than merely believed to be
 * one.
 */
export function assertVaultTarget(
  target: EnvTarget,
): asserts target is VaultTarget {
  if (!isVaultTarget(target)) throw new NoVaultProjectError(target);
}

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
