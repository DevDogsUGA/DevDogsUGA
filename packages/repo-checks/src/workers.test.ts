/**
 * Re-homed from `packages/devtools/src/workers.test.ts` (Backstage devtools
 * cutover, stage B — see `packages/devtools/MOVED-TESTS.md` in Backstage for
 * the original). Rewritten as a plain structural assertion with no devtools
 * import: `workers.json` and its two dependents (real `wrangler.jsonc` files,
 * `.github/workflows/deploy-app.yaml`'s deploy matrix) are all repo-local
 * data devtools never owned — devtools only ever *read* `workers.json`
 * (`WORKER_APPS`/`WORKER_PATHS` in its own `src/workers.ts`), so re-deriving
 * the same values here needs nothing devtools exports.
 *
 * Why this exists.
 *
 * `workers.json` is the one list of Worker apps, but nothing enforces that it
 * stays right — a new `wrangler.jsonc` under `packages/*` (or a renamed app
 * directory) could drift from it silently, and the credential-bearing deploy
 * matrix in `.github/workflows/deploy-app.yaml` is hand-written YAML that
 * `workers.json` cannot see at all (decided: it stays literal, no dynamic
 * matrix in a workflow that holds deploy credentials). This is the alarm for
 * both kinds of drift.
 *
 * Fixed for stage B: the deploy matrix moved out of `deploy.yaml` into the
 * reusable `deploy-app.yaml`, and it is defined ONCE there (both staging and
 * production call the same reusable job via `uses:` + `with: { tier }`)
 * rather than twice — the old test expected two literal `matrix.include`
 * blocks in `deploy.yaml`; this one expects exactly one in `deploy-app.yaml`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "./project-root.js";

const WORKER_PATHS: readonly string[] = JSON.parse(
  readFileSync(join(PROJECT_ROOT, "workers.json"), "utf8"),
) as readonly string[];
const WORKER_APPS: readonly string[] = WORKER_PATHS.map((path) =>
  basename(path),
);

/** The `packages:` glob list from `pnpm-workspace.yaml` — e.g. `["apps/*",
 * "packages/*", "docs"]`. Stops at the next top-level (column-0) key. */
function workspaceGlobs(yamlText: string): string[] {
  const lines = yamlText.split("\n");
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) {
    throw new Error("pnpm-workspace.yaml: no top-level `packages:` key found.");
  }
  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^\s*-\s*([^\s#]+)/.exec(line);
    if (match?.[1]) globs.push(match[1]);
  }
  return globs;
}

/** Expands `pnpm-workspace.yaml` globs (a bare name, or `dir/*`) against the
 * filesystem, returning every workspace-relative directory that has its own
 * `package.json`. */
function expandWorkspacePackages(globs: readonly string[]): string[] {
  const packages: string[] = [];
  for (const glob of globs) {
    if (glob.endsWith("/*")) {
      const dir = glob.slice(0, -2);
      const absoluteDir = join(PROJECT_ROOT, dir);
      if (!existsSync(absoluteDir)) continue;
      for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const relative = `${dir}/${entry.name}`;
        if (existsSync(join(PROJECT_ROOT, relative, "package.json"))) {
          packages.push(relative);
        }
      }
    } else if (existsSync(join(PROJECT_ROOT, glob, "package.json"))) {
      packages.push(glob);
    }
  }
  return packages;
}

/** The `matrix.include` block(s)' `app:` values, in the `strategy: matrix:
 * include:` shape `deploy-app.yaml` uses. */
function deployMatrixApps(yamlText: string): string[][] {
  const lines = yamlText.split("\n");
  const blocks: string[][] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*matrix:\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*include:\s*$/.test(lines[j]!)) j += 1;
    const apps: string[] = [];
    for (let k = j + 1; k < lines.length; k += 1) {
      const line = lines[k]!;
      const appMatch = /^\s*- app:\s*(\S+)\s*$/.exec(line);
      if (appMatch?.[1]) {
        apps.push(appMatch[1]);
        continue;
      }
      if (/^\s*mint:/.test(line) || /^\s*#/.test(line) || /^\s*$/.test(line)) {
        continue;
      }
      break;
    }
    if (apps.length > 0) blocks.push(apps);
  }
  return blocks;
}

describe("workers.json", () => {
  it("lists exactly the workspace packages that ship a wrangler.jsonc", () => {
    const yamlText = readFileSync(
      join(PROJECT_ROOT, "pnpm-workspace.yaml"),
      "utf8",
    );
    const scanned = expandWorkspacePackages(workspaceGlobs(yamlText));
    const withWranglerConfig = scanned.filter((relative) =>
      existsSync(join(PROJECT_ROOT, relative, "wrangler.jsonc")),
    );

    expect(new Set(withWranglerConfig)).toEqual(new Set(WORKER_PATHS));
  });

  it("names each entry so directory name, package name and app slug agree", () => {
    for (const path of WORKER_PATHS) {
      const pkg = JSON.parse(
        readFileSync(join(PROJECT_ROOT, path, "package.json"), "utf8"),
      ) as { name?: string };
      const slug = path.split("/").pop();
      expect(pkg.name, `${path}/package.json name`).toBe(slug);
    }
  });

  it("keeps deploy-app.yaml's ONE reusable deploy matrix equal to WORKER_APPS, minus sandbox", () => {
    const yamlText = readFileSync(
      join(PROJECT_ROOT, ".github", "workflows", "deploy-app.yaml"),
      "utf8",
    );
    const blocks = deployMatrixApps(yamlText);

    // One matrix, shared by both staging-deploy and production-deploy
    // (deploy.yaml's two callers `uses:` this same reusable workflow) — a
    // workflow restructure that drops it, or reintroduces a second literal
    // copy, is itself a failure here.
    expect(blocks).toHaveLength(1);
    // `sandbox` ships a wrangler.jsonc (so it is in WORKER_APPS) but is
    // deliberately excluded from the automated deploy matrix — see
    // deploy-app.yaml's own comment on why.
    const deployed = WORKER_APPS.filter((app) => app !== "sandbox");
    for (const apps of blocks) {
      expect(new Set(apps)).toEqual(new Set(deployed));
    }
  });

  it("runs every deploy-app.yaml devtools step through the installed devtools-ci bin", () => {
    const yamlText = readFileSync(
      join(PROJECT_ROOT, ".github", "workflows", "deploy-app.yaml"),
      "utf8",
    );

    // Post-cutover shape: `pnpm exec devtools-ci deploy <step>` — one
    // occurrence each, since the matrix (and so this job) is defined once,
    // not once per tier as it was when it lived in deploy.yaml.
    expect(
      yamlText.match(/pnpm exec devtools-ci deploy secrets-file/g),
      "secrets-file step",
    ).toHaveLength(1);
    expect(
      yamlText.match(/pnpm exec devtools-ci deploy \$\{\{ matrix\.app \}\}/g),
      "per-app deploy step",
    ).toHaveLength(1);
    // No leftover `pnpm --filter @devdogsuga/devtools run ci…` invocations —
    // that filter target no longer resolves to anything once
    // packages/devtools is deleted from this repo.
    expect(yamlText).not.toMatch(/pnpm --filter @devdogsuga\/devtools/);
  });
});
