/**
 * Structural check for `devtools-minimums.json` (repo root) — the version
 * manifest `@devdogsuga/devtools`' dlx preflight fetches from `main` on every
 * `pnpm devtools …` invocation (see `packages/devtools/src/repo/preflight.ts`
 * in Backstage). Two invariants this repo needs held, neither of which
 * types or `define()` can see across files:
 *
 * 1. `devtools.latest` must equal the exact version pinned as this repo's
 *    root `package.json` `@devdogsuga/devtools` devDependency — that pin is
 *    CI's copy, and the two silently drifting apart is exactly what would
 *    make the "latest" preflight nudges lie about what's actually current.
 *    Renovate bumps both together (a `customManagers` regex manager rewrites
 *    `latest` alongside the package.json pin, same PR, same group) — this
 *    check is the guard for anyone who edits one by hand and misses the
 *    other, or for a Renovate config that drifts out of sync with its own
 *    intent.
 * 2. `devtools.minimum` must be `<=` `devtools.latest` — the floor can never
 *    sit above the ceiling. `minimum` stays a manual, deliberate hotfix
 *    lever (see the manifest's own `$comment`) and is NOT expected to equal
 *    `latest` day to day, only to never exceed it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./project-root.js";

interface DevtoolsMinimumsManifest {
  devtools: { latest: string; minimum: string };
}

interface RootPackageJson {
  devDependencies?: Record<string, string>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Three-part semver comparison; `<0` means `a` is older than `b`. Anything
 * non-numeric in a segment sorts as `0`, which is permissive on purpose —
 * this only ever compares well-formed manifest/package versions. Mirrors
 * `compareVersions` in Backstage's `packages/devtools/src/repo/preflight.ts`,
 * the actual consumer of these two fields, so "in sync" means the same thing
 * here as it does there. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface DevtoolsMinimumsCheckResult {
  ok: boolean;
  errors: string[];
  latest: string;
  minimum: string;
  pin: string | undefined;
}

/**
 * Reads `devtools-minimums.json` and the root `package.json` pin straight
 * off disk (no imports from either — this has to catch the two disagreeing
 * even when nothing else in the repo would notice) and reports whether the
 * two invariants above hold.
 */
export function checkDevtoolsMinimums(
  projectRoot: string = PROJECT_ROOT,
): DevtoolsMinimumsCheckResult {
  const manifest = readJson<DevtoolsMinimumsManifest>(
    join(projectRoot, "devtools-minimums.json"),
  );
  const pkg = readJson<RootPackageJson>(join(projectRoot, "package.json"));
  const { latest, minimum } = manifest.devtools;
  const pin = pkg.devDependencies?.["@devdogsuga/devtools"];

  const errors: string[] = [];

  if (pin === undefined) {
    errors.push(
      'package.json has no @devdogsuga/devtools devDependency to compare devtools-minimums.json\'s "latest" against.',
    );
  } else if (pin !== latest) {
    errors.push(
      `devtools-minimums.json's "latest" (${latest}) does not match package.json's @devdogsuga/devtools pin (${pin}). Renovate bumps both in the same PR — if only one changed, the other was edited by hand.`,
    );
  }

  if (compareVersions(minimum, latest) > 0) {
    errors.push(
      `devtools-minimums.json's "minimum" (${minimum}) is greater than "latest" (${latest}). The floor can never sit above the ceiling.`,
    );
  }

  return { ok: errors.length === 0, errors, latest, minimum, pin };
}

// Runnable directly (`tsx src/devtools-minimums.ts` from this package, or
// `pnpm --filter @devdogsuga/repo-checks exec tsx src/devtools-minimums.ts`
// from the repo root) for a quick manual check outside of `vitest run` —
// prints the errors, if any, and exits non-zero on failure.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkDevtoolsMinimums();
  if (result.ok) {
    console.log(
      `devtools-minimums.json is consistent (latest=${result.latest}, minimum=${result.minimum}, pin=${result.pin}).`,
    );
  } else {
    for (const error of result.errors) console.error(error);
  }
  process.exit(result.ok ? 0 : 1);
}
