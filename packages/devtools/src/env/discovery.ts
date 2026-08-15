/**
 * Fills the `@devdogsuga/env` registry by importing every manifest.
 *
 * The registry populates as a SIDE EFFECT of importing each manifest module —
 * `declare()` runs at import time — so a process that never imports them sees
 * an empty registry and every derived selector returns nothing. That is the
 * fail-open shape this module exists to close: anything that routes secrets
 * calls `loadRegistry()` first, and `assertRegistryLoaded()` is the guard the
 * selectors' consumers use to refuse an empty answer.
 *
 * Discovery is by filename, per the model doc: `src/env.ts`, then `env.ts`,
 * per workspace package — both present is a hard error, because two manifests
 * in one package means two places for the next declaration to land and no rule
 * saying which. No `package.json` pointer: every other tool in this repo is
 * found by filename (`tsconfig.json`, `wrangler.jsonc`, `supadart.yaml`), and
 * a pointer would be the only one of its kind.
 *
 * Two special cases, both deliberate:
 *
 *   * `supabase/env.ts` sits at the repo root, OUTSIDE the workspace globs —
 *     its variables belong to `config.toml` and the Supabase CLI, not to any
 *     package, so it lives next to the config that reads them.
 *   * `packages/env` is excluded. It exports `define()`/`declare()`; it
 *     declares nothing itself, and importing its `src/env*.ts` internals as a
 *     manifest would be a category error.
 *
 * `apps/sandbox` has no manifest on purpose (it reads Worker bindings), which
 * is why "no env.ts found" is simply not-a-manifest rather than an error.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { variables } from "@devdogsuga/env";
import { PROJECT_ROOT } from "../instance.js";

/**
 * The single in-flight (or settled) load.
 *
 * Node's module cache already makes a second `import()` of the same manifest a
 * no-op, but memoizing the whole pass is asserted here rather than inherited:
 * a future bundler or test runner that re-evaluates modules would otherwise
 * duplicate every declaration, and duplicated declarations are exactly what
 * the completeness test treats as a bug. A failed load stays failed — every
 * later call gets the same rejection, because retrying into a half-populated
 * registry would hide the manifest that broke.
 */
let loaded: Promise<void> | undefined;

/**
 * Imports every manifest so the registry populates. Idempotent; concurrent
 * callers share one pass. Await this before touching any derived selector.
 */
export function loadRegistry(): Promise<void> {
  loaded ??= importManifests();
  return loaded;
}

/**
 * Refuses to proceed on an empty registry.
 *
 * For SYNC consumers of the derived selectors (`selectForPush`, `routeTo`),
 * which cannot await the load themselves. An empty registry makes every
 * selector return `[]`, and `[]` fails open in the worst direction: nothing is
 * never-store, so `BWS_ACCESS_TOKEN` would upload. Better a crash naming the
 * missing call than a push that quietly stores the unstorable.
 */
export function assertRegistryLoaded(): void {
  if (variables().size === 0) {
    throw new Error(
      "The env registry is empty — no manifest has been imported, so the " +
        "derived key sets would all be []. Await loadRegistry() (from " +
        "devtools' env/discovery.ts) before routing or selecting secrets.",
    );
  }
}

async function importManifests(): Promise<void> {
  // The Next apps' manifests run `createEnv` at import time, and without this
  // flag they would validate the AMBIENT environment — a devtools process, not
  // an app build — and throw on whatever is missing. The manifests already
  // short-circuit their `resolveEnvironment()` call under the flag, so setting
  // it here is the supported "read the declarations, skip the values" mode.
  // Restored afterward so a long-lived process (tests) does not silently keep
  // validation off for whatever runs next.
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

/**
 * Every manifest file, in a stable order.
 *
 * The workspace members are enumerated by scanning `apps/*` and `packages/*`
 * plus the literal `docs` — deliberately a boring mirror of the three globs in
 * `pnpm-workspace.yaml` rather than a YAML parse: the globs have not changed
 * since the workspace existed, devtools carries no YAML dependency, and a new
 * top-level glob would already mean editing more interesting files than this
 * one.
 */
function manifestPaths(): string[] {
  const paths: string[] = [];

  for (const dir of workspaceDirs()) {
    const manifest = manifestIn(dir);
    if (manifest) paths.push(manifest);
  }

  // The repo-root special case: not a workspace package, see the header.
  const supabase = manifestIn(join(PROJECT_ROOT, "supabase"));
  if (supabase) paths.push(supabase);

  return paths;
}

function workspaceDirs(): string[] {
  const dirs: string[] = [];
  for (const parent of ["apps", "packages"]) {
    const names: string[] = [];
    for (const entry of readdirSync(join(PROJECT_ROOT, parent), {
      withFileTypes: true,
    })) {
      // node_modules and dotfiles are not packages; packages/env exports the
      // helpers and declares nothing (see the header).
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (parent === "packages" && entry.name === "env") continue;
      names.push(entry.name);
    }
    // Sorted, because readdir order is whatever the filesystem feels like and
    // registry insertion order is now OBSERVABLE: `secrets example` renders
    // keys in declaration order and CI byte-compares the result, so two
    // machines walking the same tree must import the same manifests in the
    // same sequence.
    names.sort();
    for (const name of names) dirs.push(join(PROJECT_ROOT, parent, name));
  }
  dirs.push(join(PROJECT_ROOT, "docs"));
  return dirs;
}

/** `src/env.ts`, then `env.ts`; both present in one package is a hard error. */
function manifestIn(dir: string): string | null {
  const inSrc = join(dir, "src", "env.ts");
  const atRoot = join(dir, "env.ts");
  const hasSrc = existsSync(inSrc);
  const hasRoot = existsSync(atRoot);

  if (hasSrc && hasRoot) {
    throw new Error(
      `${dir} has BOTH src/env.ts and env.ts. One package gets one manifest — ` +
        "two of them means two places for the next declaration to land, and " +
        "no rule saying which. Merge them.",
    );
  }
  return hasSrc ? inSrc : hasRoot ? atRoot : null;
}
