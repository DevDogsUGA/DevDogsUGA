/**
 * The GitHub environments, and which BWS project (if any) backs each.
 *
 * GitHub environments and BWS projects are NOT the same set, and conflating
 * them is the mistake this file exists to prevent. There are FOUR GitHub
 * environments and THREE BWS projects:
 *
 *   | GitHub environment | BWS project          | Receives                     |
 *   |--------------------|----------------------|------------------------------|
 *   | `preflight`        | `devdogs-preflight`  | everything in the project    |
 *   | `staging`          | `devdogs-staging`    | everything in the project    |
 *   | `production`       | `devdogs-production` | everything EXCEPT apply-only |
 *   | `production-apply` | `devdogs-production` | everything, apply-only too   |
 *
 * The last two split one project between two GitHub environments, and that
 * split IS the reviewer gate. `production` deploys on a push with nothing in
 * front of it; `production-apply` has required reviewers. A write-capable
 * credential reaching the first makes the second decorative, so the routing is
 * enforced here rather than left to whoever last edited a file.
 *
 * ⚠️ THE GATE IS ONE-DIRECTIONAL, and reading it as symmetric is the mistake
 * this file made until 2026-08-17. What the gate asserts is that apply-tier
 * credentials never reach the UNREVIEWED environment — `production.excludeKeys`
 * — and nothing more. It says nothing about what the reviewed environment may
 * additionally hold, because holding more there buys no privilege: it is the
 * same Bitwarden project, and `production-apply` is the strictly MORE trusted
 * of the two. Withholding ordinary keys from it broke every job that runs
 * there — the config push wanted deploy-tier OAuth secrets, the Airtable apply
 * wanted a public base id, the orphan prune wanted a deploy-tier API token — so
 * `production-apply` now receives a SUPERSET of `production`.
 */
import { applyOnlyKeys, planOnlyKeys } from "@devdogsuga/env";
import { assertRegistryLoaded } from "../env/discovery.js";

export const GITHUB_ENVIRONMENTS = [
  "preflight",
  "staging",
  "production",
  "production-apply",
] as const;

export type GithubEnvironment = (typeof GITHUB_ENVIRONMENTS)[number];

export function isGithubEnvironment(v: string): v is GithubEnvironment {
  return (GITHUB_ENVIRONMENTS as readonly string[]).includes(v);
}

export interface GithubEnvironmentSpec {
  /** BWS project to compare against, or null when nothing backs it. */
  bwsProject: string | null;
  /** Deployment branch policy, for the summary line. */
  branch: string;
  /**
   * Keys allowed here, or null for "whatever the file defines".
   *
   * ⚠️ NULL ON EVERY ROW TODAY, and that is the deliberate state rather than a
   * field nobody got round to filling in. `production-apply` used to carry the
   * apply-tier pair here, on the reasoning that "holding a third credential
   * makes the reviewer gate stop meaning anything" — which conflated two
   * constraints and kept only the one that was not the gate. An allowlist here
   * restricts what the REVIEWED environment may hold; the gate is
   * `production.excludeKeys`, which restricts what the UNREVIEWED one may hold.
   * Only the second is a security property, and it is enforced below.
   *
   * Kept as a field because the mechanism is worth having and costs one branch
   * in `accepts()`: a future environment that genuinely holds a fixed short
   * list — a third-party integration's two keys and nothing else — states it
   * here rather than as an `excludeKeys` of everything else.
   */
  onlyKeys: readonly string[] | null;
  /**
   * Keys that must never reach this environment.
   *
   * The whole reviewer gate now lives in this field: `production` (and
   * `staging`) exclude the apply-tier set, and nothing else stops a
   * write-capable credential from landing in an environment that deploys with
   * nobody in front of it.
   */
  excludeKeys: readonly string[];
  /** Extra confirmation before writing. */
  guarded: boolean;
}

/**
 * The apply-only set, derived from the env manifests (`tier: "apply"` on the
 * declarations in `packages/devtools/env.ts`) rather than listed here.
 *
 * Read at ACCESS time, not module load: this module is imported by the CLI
 * before any manifest is, so a snapshot taken now would be empty — and an
 * empty apply set routes the write-capable credentials to the unreviewed
 * `production` environment, which is the exact failure the split exists to
 * prevent. The guard turns "forgot to loadRegistry()" into a crash instead.
 */
function applyOnly(): readonly string[] {
  assertRegistryLoaded();
  return applyOnlyKeys();
}

/**
 * The plan-tier set, same shape and same load-time caveat as `applyOnly()`.
 * Read by `main-plan` (preflight) and `production-plan` (production); a copy
 * anywhere else is a credential nothing reads, so `staging` excludes it.
 */
function planOnly(): readonly string[] {
  assertRegistryLoaded();
  return planOnlyKeys();
}

export const GITHUB_ENVIRONMENT_SPECS: Record<
  GithubEnvironment,
  GithubEnvironmentSpec
> = {
  preflight: {
    bwsProject: "devdogs-preflight",
    branch: "main",
    onlyKeys: null,
    excludeKeys: [],
    guarded: false,
  },
  staging: {
    bwsProject: "devdogs-staging",
    branch: "main",
    onlyKeys: null,
    // Both narrow tiers: no staging job plans, and none may apply.
    get excludeKeys() {
      return [...applyOnly(), ...planOnly()];
    },
    guarded: false,
  },
  // ⚠️ THE REVIEWER GATE, in one property. `excludeKeys` here is the only
  // thing keeping the apply-tier credentials out of an environment that
  // deploys on a push to `production` with nobody in front of it. Widening it
  // to `[]` — or letting `applyOnly()` answer empty, which is what
  // `assertRegistryLoaded()` exists to prevent — hands a write-capable token to
  // an unreviewed deploy. `environments.test.ts` asserts both apply keys by
  // name against exactly this.
  production: {
    bwsProject: "devdogs-production",
    branch: "production",
    onlyKeys: null,
    get excludeKeys() {
      return applyOnly();
    },
    guarded: true,
  },
  // A SUPERSET of `production`, deliberately: everything that environment
  // receives, plus the apply-tier pair it may not have.
  //
  // Not a relaxation of the gate. This is the same Bitwarden project behind
  // required reviewers — the more trusted half of the split — so withholding a
  // key from it protects nothing and only starves the jobs that run here
  // (`production-config`, `production-airtable`, `prune-orphans`, all of which
  // needed a deploy-tier secret or a public variable and got neither). The gate
  // is what `production` may NOT have, one row above.
  "production-apply": {
    bwsProject: "devdogs-production",
    branch: "production",
    onlyKeys: null,
    excludeKeys: [],
    guarded: true,
  },
};

// ── Routing ──────────────────────────────────────────────────────────────────
//
// One Bitwarden project can feed more than one GitHub environment — production
// feeds two — so a push has to know which key goes where. Derived from the
// table above rather than written out a second time: the split IS the reviewer
// gate, and a hardcoded copy of it is a copy that can disagree.

/** The GitHub environments fed by one Bitwarden project, in precedence order. */
export function githubTargets(bwsProject: string): GithubEnvironment[] {
  return GITHUB_ENVIRONMENTS.filter(
    (e) => GITHUB_ENVIRONMENT_SPECS[e].bwsProject === bwsProject,
  );
}

/** Whether one environment takes a given key. */
export function accepts(environment: GithubEnvironment, key: string): boolean {
  const spec = GITHUB_ENVIRONMENT_SPECS[environment];
  return spec.onlyKeys
    ? spec.onlyKeys.includes(key)
    : !spec.excludeKeys.includes(key);
}

/**
 * The PRIMARY environment a key belongs in, or `null` for "nowhere here".
 *
 * `null` is not an error. Pushing `staging` with an apply-only credential in
 * the file is the ordinary case — that key belongs to production and simply has
 * no home in the staging environment.
 *
 * ⚠️ "Primary", not "only". Since `production-apply` became a superset, an
 * ordinary production key legitimately lives in TWO environments and this
 * returns the first — the unreviewed one, where the deploy reads it. A caller
 * asking "is this copy misplaced?" wants `acceptedBy()` instead; answering that
 * question with this function reports every correctly-pushed copy in
 * `production-apply` as a stray that somebody should delete.
 */
export function routeTo(
  bwsProject: string,
  key: string,
): GithubEnvironment | null {
  return acceptedBy(bwsProject, key)[0] ?? null;
}

/**
 * EVERY environment of a project that takes a key, in precedence order.
 *
 * The set-shaped question, for callers that compare against what a push
 * actually wrote rather than against one destination. `routeTo()` is this with
 * `[0]` taken, and the difference is only ever visible for `devdogs-production`
 * — the one project that fans out to two environments.
 */
export function acceptedBy(
  bwsProject: string,
  key: string,
): GithubEnvironment[] {
  return githubTargets(bwsProject).filter((e) => accepts(e, key));
}

/**
 * `accepts()` for an environment name that has not been narrowed yet, in the
 * argument order `AuditInput.accepted` wants.
 *
 * Exists so that the predicate `env audit` hands the audit is a NAME rather
 * than a lambda written at the call site: `runEnvAudit` cannot be unit-tested
 * without mocking Bitwarden, GitHub and Cloudflare at once, so anything spelled
 * out there is untested by construction.
 *
 * ⚠️ An unrecognised environment is REFUSED, not accepted. The string comes
 * from whatever `gh` listed, and the audit uses this to decide whether a found
 * copy is a stray — so failing open here would silence the finding for a copy
 * sitting in an environment this repository has never heard of, which is
 * exactly the case worth hearing about.
 */
export function acceptsKey(key: string, environment: string): boolean {
  return isGithubEnvironment(environment) && accepts(environment, key);
}
