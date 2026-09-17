/**
 * Why this file exists.
 *
 * `workers.json` is the one list of Worker apps, but nothing enforces that it
 * stays right — a new `wrangler.jsonc` under `packages/` (or a renamed app
 * directory) could drift from it silently, and the credential-bearing GitHub
 * Actions deploy matrices in `.github/workflows/deploy.yaml` are hand-written
 * YAML that `workers.json` cannot see at all (decided: they stay literal, no
 * dynamic matrix in a workflow that holds deploy credentials). This is the
 * alarm for both kinds of drift:
 *
 *   1. Workspace scan — every workspace package (not just `apps/*`; a future
 *      Worker under `packages/` must trip this too) that ships a
 *      `wrangler.jsonc` must be exactly `workers.json`'s set, both ways nothing
 *      unlisted, nothing stale.
 *   2. Identity invariant — each `workers.json` path's `package.json` name
 *      must equal the path's basename, because the CLI relies on directory
 *      name = package name = `pnpm --filter` argument = env-registry
 *      `source` being the same string everywhere.
 *   3. deploy.yaml matrices — the staging and production `matrix.include`
 *      blocks' `app:` values must equal `WORKER_APPS`.
 *
 * No YAML dependency is added for this: `pnpm-workspace.yaml`'s `packages:`
 * list and deploy.yaml's `- app: <name>` matrix entries are both simple
 * enough for a targeted line scan, and adding a parser dependency to catch a
 * handful of lines would be a worse trade than the scan below.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "./environment.js";
import { WORKER_APPS, WORKER_PATHS } from "./workers.js";

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

/** The two staging/production `matrix.include` blocks' `app:` values, in the
 * `strategy: matrix: include:` shape `deploy.yaml` uses. */
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
      // `mint:`, its trailing comments, and blank lines are the rest of the
      // same list item / block; anything else is the next YAML key, i.e. the
      // block ended.
      if (/^\s*mint:/.test(line) || /^\s*#/.test(line) || /^\s*$/.test(line)) {
        continue;
      }
      break;
    }
    if (apps.length > 0) blocks.push(apps);
  }
  return blocks;
}

describe("workers.json / workers.ts", () => {
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

  it("keeps deploy.yaml's staging and production matrices equal to WORKER_APPS", () => {
    const yamlText = readFileSync(
      join(PROJECT_ROOT, ".github", "workflows", "deploy.yaml"),
      "utf8",
    );
    const blocks = deployMatrixApps(yamlText);

    // Both the staging-deploy and production-deploy jobs must be present, so
    // a workflow restructure that drops one silently is itself a failure here.
    expect(blocks).toHaveLength(2);
    for (const apps of blocks) {
      expect(new Set(apps)).toEqual(new Set(WORKER_APPS));
    }
  });
});
