/**
 * The generator's scope rule, which source files a target's reference is built
 * from, split out of `program.ts` because it needs nothing but the filesystem.
 *
 * `program.ts` pulls in the TypeScript compiler; `docs-kit build`'s cache
 * check (`build-cache.ts`) has to answer "did any of the generator's inputs
 * change" without paying for that import on the common path, where nothing
 * did. Both ask this module, so the cache cannot watch a different set of files
 * from the one the generator reads.
 */
import * as fs from "node:fs";

/**
 * Directory names that end scope at any depth, no matter what encloses them.
 * A dependency's sources are somebody else's documentation.
 */
const EXCLUDED_ANYWHERE = new Set(["node_modules"]);

/**
 * Directory names that end scope only *below* a target's `src/`. Nested there
 * they hold machine-generated schema output: the `supabase/drizzle/` and
 * `server/db/schema/generated/` trees under `apps/platform/src`, which the
 * database reference already covers from `devtools`. Documenting a generated
 * file twice is how two references start disagreeing.
 *
 * The depth restriction is the point. `packages/drizzle` is a hand-written
 * client factory named after the tool it wraps, and testing these names against
 * every segment of a path excluded the whole package on the strength of its
 * directory name alone. A package named after a tool is not that tool's output.
 */
const GENERATED_SEGMENTS = new Set(["generated", "drizzle"]);

/**
 * The mechanical scope rule. `absFile` is absolute and posix-separated.
 *
 * Excluded: `*.test.ts(x)`, `*.db-test.ts`, `*.d.ts`, anything under a
 * `node_modules/` at any depth, and anything under a `generated/` or
 * `drizzle/` directory that lies *below* the target's `src/`, meaning in the
 * segments following the last `src` in the path.
 *
 * Where those two exclusions differ is the part that rots silently, so stated
 * as cases: `packages/drizzle/src/index.ts` is in scope, because a package
 * named after the tool it wraps is hand-written source and its directory name
 * says nothing about its contents. `packages/drizzle/src/generated/x.ts` and
 * `apps/platform/src/supabase/drizzle/schema.ts` are both out, because a
 * `drizzle/` or `generated/` folder *inside* a source tree really is machine
 * output that the database reference already covers.
 */
export function isInScope(absFile: string): boolean {
  const segments = toPosix(absFile).split("/");
  const basename = segments.at(-1) ?? "";

  if (!/\.tsx?$/.test(basename)) return false;
  if (basename.endsWith(".d.ts")) return false;
  if (/\.(?:test|db-test)\.tsx?$/.test(basename)) return false;

  const directories = segments.slice(0, -1);
  if (directories.some((segment) => EXCLUDED_ANYWHERE.has(segment))) {
    return false;
  }

  // A path with no `src` at all sends `lastIndexOf` to -1 and the slice back to
  // the front, reading every segment as nested. That is the conservative answer
  // for a file no target's `src/` contains, and the walk never produces one.
  const nested = directories.slice(directories.lastIndexOf("src") + 1);
  return !nested.some((segment) => GENERATED_SEGMENTS.has(segment));
}

/** In-scope source files under one `src/` directory, absolute, sorted. */
export function sourceFilesUnder(srcDir: string): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of childEntries(dir)) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // Redundant with `isInScope`, but it keeps the walk out of trees that
        // can hold tens of thousands of files. The walk starts at `src/`, so
        // every directory it reaches is nested and both sets apply.
        if (EXCLUDED_ANYWHERE.has(entry.name)) continue;
        if (GENERATED_SEGMENTS.has(entry.name)) continue;
        walk(child);
      } else if (entry.isFile() && isInScope(child)) {
        files.push(child);
      }
    }
  };

  walk(toPosix(srcDir));
  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function toPosix(file: string): string {
  return file.replace(/\\/g, "/");
}

function childEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
