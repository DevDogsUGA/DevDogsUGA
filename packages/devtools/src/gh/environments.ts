/**
 * The GitHub environments, and which BWS project (if any) backs each.
 *
 * GitHub environments and BWS projects are NOT the same set, and conflating
 * them is the mistake this file exists to prevent. There are FOUR GitHub
 * environments and THREE BWS projects:
 *
 *   | GitHub environment | BWS project          | Receives                     |
 *   |--------------------|----------------------|------------------------------|
 *   | `dry-run`          | `devdogs-dry-run`    | everything in the project    |
 *   | `staging`          | `devdogs-staging`    | everything in the project    |
 *   | `production`       | `devdogs-production` | everything EXCEPT apply-only |
 *   | `production-apply` | `devdogs-production` | ONLY the apply-only keys     |
 *
 * The last two split one project between two GitHub environments, and that
 * split IS the reviewer gate. `production` deploys on a push with nothing in
 * front of it; `production-apply` has required reviewers. A write-capable
 * credential reaching the first makes the second decorative, so the routing is
 * enforced here rather than left to whoever last edited a file.
 */
import { APPLY_ONLY_KEYS } from "../bws/environments.js";

export const GITHUB_ENVIRONMENTS = [
  "dry-run",
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
   * A list rather than a convention: `production-apply` exists to hold exactly
   * two credentials, and the failure mode of it quietly holding a third is that
   * the reviewer gate stops meaning anything.
   */
  onlyKeys: readonly string[] | null;
  /** Keys that must never reach this environment. */
  excludeKeys: readonly string[];
  /** Extra confirmation before writing. */
  guarded: boolean;
}

export const GITHUB_ENVIRONMENT_SPECS: Record<
  GithubEnvironment,
  GithubEnvironmentSpec
> = {
  "dry-run": {
    bwsProject: "devdogs-dry-run",
    branch: "main",
    onlyKeys: null,
    excludeKeys: [],
    guarded: false,
  },
  staging: {
    bwsProject: "devdogs-staging",
    branch: "main",
    onlyKeys: null,
    excludeKeys: APPLY_ONLY_KEYS,
    guarded: false,
  },
  production: {
    bwsProject: "devdogs-production",
    branch: "production",
    onlyKeys: null,
    excludeKeys: APPLY_ONLY_KEYS,
    guarded: true,
  },
  "production-apply": {
    bwsProject: "devdogs-production",
    branch: "production",
    onlyKeys: APPLY_ONLY_KEYS,
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
 * The one environment a key belongs in, or `null` for "nowhere here".
 *
 * `null` is not an error. Pushing `staging` with an apply-only credential in
 * the file is the ordinary case — that key belongs to production and simply has
 * no home in the staging environment.
 */
export function routeTo(
  bwsProject: string,
  key: string,
): GithubEnvironment | null {
  return githubTargets(bwsProject).find((e) => accepts(e, key)) ?? null;
}
