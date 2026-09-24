/**
 * A minimal re-implementation of devtools' env/discovery.ts loadRegistry()
 * for this repo's own tests. Genuinely repo-owned logic, not a devtools
 * internal borrowed under duress: this is a description of THIS repo's own
 * convention for where env manifests live (`src/env.ts` or `env.ts` per
 * workspace package, plus `supabase/env.ts` at the repo root) — the same
 * convention devtools documents in its own discovery.ts, kept here in
 * parallel deliberately, not imported, since devtools declares no `exports`
 * for internals like this. If this convention ever changes, both copies
 * need the same edit; that duplication is the accepted cost of not building
 * a dependency on an unstable internal surface.
 *
 * This module only runs under Vitest (vite-node), which transforms a plain
 * `import()` of a `.ts` file on the fly and — load-bearingly — shares ONE
 * module registry with the rest of the test process: a manifest's
 * `declare()`/`define()` calls and this test's own
 * `import { variables } from "@devdogsuga/env"` land in the SAME
 * `@devdogsuga/env` module instance. Tried tsx's `tsImport` API first (a
 * real dependency of this package, not devtools-owned) and it does NOT
 * share that registry — confirmed empirically: `variables().size` stayed 0
 * after a successful `tsImport` of a real manifest, both inside and outside
 * Vitest, even though `createRequire` resolves `@devdogsuga/env` to the
 * identical file path from both the manifest's and this package's location.
 * Plain `import()` under Vitest does not have that problem, so it's what
 * loadRegistry() uses; this module is Vitest-only as a result (fine — its
 * one caller is a `*.test.ts` file).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PROJECT_ROOT } from "./project-root.js";

function manifestIn(dir: string): string | undefined {
  const nested = join(dir, "src", "env.ts");
  const flat = join(dir, "env.ts");
  const nestedExists = existsSync(nested);
  const flatExists = existsSync(flat);
  if (nestedExists && flatExists) {
    throw new Error(`${dir}: both src/env.ts and env.ts exist — pick one.`);
  }
  if (nestedExists) return nested;
  if (flatExists) return flat;
  return undefined;
}

function workspaceDirs(): string[] {
  const dirs: string[] = [];
  for (const top of ["apps", "packages"]) {
    const topDir = join(PROJECT_ROOT, top);
    if (!existsSync(topDir)) continue;
    for (const entry of readdirSync(topDir, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(topDir, entry.name));
    }
  }
  const docsDir = join(PROJECT_ROOT, "docs");
  if (existsSync(docsDir)) dirs.push(docsDir);
  return dirs;
}

function manifestPaths(): string[] {
  const paths: string[] = [];
  for (const dir of workspaceDirs()) {
    const manifest = manifestIn(dir);
    if (manifest) paths.push(manifest);
  }
  const supabaseManifest = manifestIn(join(PROJECT_ROOT, "supabase"));
  if (supabaseManifest) paths.push(supabaseManifest);
  return paths;
}

let loaded: Promise<void> | undefined;

/** Imports every manifest so @devdogsuga/env's registry populates. Idempotent
 * and memoized, same shape as devtools' own loadRegistry(). */
export function loadRegistry(): Promise<void> {
  loaded ??= importManifests();
  return loaded;
}

async function importManifests(): Promise<void> {
  // Same reasoning as devtools' own copy: the Next apps' manifests call
  // createEnv() at import time and would otherwise validate THIS process's
  // ambient environment rather than being read for their declarations only.
  const previous = process.env.SKIP_ENV_VALIDATION;
  process.env.SKIP_ENV_VALIDATION = "1";
  try {
    for (const path of manifestPaths()) {
      try {
        await import(pathToFileURL(path).href);
      } catch (cause) {
        throw new Error(`The env manifest at ${path} failed to import.`, {
          cause,
        });
      }
    }
  } finally {
    if (previous === undefined) delete process.env.SKIP_ENV_VALIDATION;
    else process.env.SKIP_ENV_VALIDATION = previous;
  }
}
