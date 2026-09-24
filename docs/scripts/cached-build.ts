/**
 * This package's `build` script, run via `tsx scripts/cached-build.ts`. Wraps `docs-compiler gen && docs-compiler`
 * (Backstage's `@devdogsuga/docs-compiler`, unchanged) behind a fingerprint
 * of everything that pass reads, and skips both steps when the fingerprint
 * matches the one recorded after the last real run — see `signature.ts` for
 * what goes into that fingerprint and why.
 *
 * Why this exists here rather than in `docs-compiler` itself: that package is
 * published from the sibling Backstage repo, so it is not something this repo
 * can change. The build IS correct either way — a cache hit only ever
 * happens when nothing the compiler would have read changed — so this stays
 * a plain wrapper around the unmodified compiler rather than a fork of it.
 *
 * Measured effect (this checkout, warm caches otherwise): a full run
 * (`docs-compiler gen && docs-compiler`) takes ~13-16s, almost entirely the
 * reference generator building one `ts.Program` per app/package over several
 * hundred `.ts`/`.tsx` files. A cache hit — the common case for
 * `pnpm dev`, which reaches this via the deps-of-platform pre-step on every
 * start (see Backstage devtools' `run/pick.ts`) even though a docs edit is
 * rare — costs the walk-and-stat pass alone: well under a second.
 *
 * `pnpm build`/CI get the exact same cache: correctness never trades against
 * dev-start speed here, because a hit is only ever a hit when the compiler's
 * own output would have been byte-identical. `--force` (or `DOCS_FORCE_REBUILD=1`)
 * bypasses it for anyone who wants to rule the cache out as a suspect.
 *
 * No watch mode existed for this package before (`docs-compiler` has no
 * `--watch`, and nothing in `apps/platform` re-imports `@devdogsuga/docs`
 * once `vinext dev` has started), so there is none to preserve. `docs/dist`
 * is read once, at dev-server start.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type FileEntry, computeSignature } from "./signature.js";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "reference",
  ".git",
  // Mirrors `GENERATED_SEGMENTS` in Backstage's `docs-compiler/src/gen/
  // program.ts`: directories named `generated`/`drizzle` below a target's
  // `src/` hold machine-written output the reference generator itself
  // refuses to read, for the reason given there (documenting a generated
  // file twice is how two references start disagreeing). Watching them here
  // would be worse than merely redundant: `packages/email`'s build step
  // rewrites `src/generated/templates.ts` unconditionally on every run (no
  // content comparison), so if its mtime counted, every `pnpm dev` start
  // would see a fresh mtime from `platform`'s own dependency-build pre-step
  // moments earlier and treat that as "docs input changed" forever — a
  // permanent cache miss, exactly the ~13s this file exists to avoid.
  "generated",
  "drizzle",
]);

/** Extensions worth stat-ing under `apps/*​/src` and `packages/*​/src` — the
 * reference generator's TypeScript scope (see this file's header). */
const TS_EXTENSIONS = [".ts", ".tsx"];

/** The Flutter app's own source, read by the Dart extractor (see
 * Backstage's `docs-compiler/src/gen/dart.ts`). Watched even though `dart`
 * is rarely on a contributor's PATH: the pass degrades to a skip-with-warning
 * when it is not, and either way the compiler's actual behavior only depends
 * on these files when `dart` IS present, which this fingerprint can't (and
 * shouldn't have to) detect — watching them is always safe, only sometimes
 * necessary. */
const DART_APP_DIR = "apps/study-group-finder";

export function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no pnpm-workspace.yaml found above ${from}`);
    }
    dir = parent;
  }
}

function walk(
  dir: string,
  exts: readonly string[] | null,
  out: string[],
): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Missing dir (e.g. no apps/study-group-finder/lib) is not an error.
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walk(join(dir, entry.name), exts, out);
    } else if (entry.isFile()) {
      if (!exts || exts.some((ext) => entry.name.endsWith(ext))) {
        out.push(join(dir, entry.name));
      }
    }
  }
}

/**
 * Every file `docs-compiler` (bare mode + `gen`) reads for a full build of
 * this content root: this package's own markdown/frontmatter/manifest, plus
 * the reference generator's TypeScript and Dart scope across the rest of the
 * workspace. Over-watching is safe in general (an extra rebuild costs the
 * ~13s this exists to avoid, on an input that turned out not to matter), so
 * this mostly errs wide rather than trying to mirror `docs-compiler`'s
 * scoping rules exactly — except `generated`/`drizzle` directories, excluded
 * via `SKIP_DIR_NAMES` for the reason given there: over-watching THOSE isn't
 * merely wasteful, it is unsound (see that comment for why: a permanent
 * cache miss, not an occasional false one). Under-watching anything else
 * would be unsound the ordinary way — a stale cache hit ships wrong docs —
 * which is the failure mode every other choice here is made against.
 */
export function collectDocsInputs(
  repoRoot: string,
  docsRoot: string,
): string[] {
  const files: string[] = [];

  // This package's own content: markdown, frontmatter, the manifest, and
  // (harmlessly) this very script — editing the cache logic invalidates the
  // cache it governs, which is the conservative direction to be wrong in.
  walk(docsRoot, null, files);

  for (const group of ["apps", "packages"]) {
    const groupDir = join(repoRoot, group);
    let entries;
    try {
      entries = readdirSync(groupDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      walk(join(groupDir, entry.name, "src"), TS_EXTENSIONS, files);
    }
  }

  const dartRoot = join(repoRoot, DART_APP_DIR);
  walk(join(dartRoot, "lib"), [".dart"], files);
  const dartScript = join(dartRoot, "tool", "docs_extract.dart");
  if (existsSync(dartScript)) files.push(dartScript);

  return files;
}

/**
 * A string that changes whenever the installed `@devdogsuga/docs-compiler`
 * would produce different output for the same content — a real version bump
 * once it publishes to npm, or (today, mid interim `.packs/` bridge — see
 * `pnpm-workspace.yaml`) a repack of the pinned tarball, which pnpm resolves
 * into a content-addressed store path even though `package.json` still says
 * the same "0.1.0". Resolving through the symlink is what turns "repacked
 * the tarball but forgot to bump the version" from a silently stale cache
 * into a correct rebuild.
 */
export function resolveCompilerIdentity(docsRoot: string): string {
  const link = join(docsRoot, "node_modules", "@devdogsuga", "docs-compiler");
  try {
    const real = realpathSync(link);
    const version = JSON.parse(
      readFileSync(join(real, "package.json"), "utf8"),
    ) as { version?: string };
    return `${real}@${version.version ?? "unknown"}`;
  } catch {
    // Can't resolve it at all — always miss rather than trust a stale cache.
    return `unresolved:${Date.now()}:${Math.random()}`;
  }
}

function statEntries(repoRoot: string, files: readonly string[]): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const file of files) {
    let st;
    try {
      st = statSync(file);
    } catch {
      continue; // Deleted between the walk and the stat: not a build input anymore.
    }
    entries.push({
      relPath: relative(repoRoot, file),
      mtimeMs: st.mtimeMs,
      size: st.size,
    });
  }
  return entries;
}

interface CacheFile {
  signature: string;
  builtAt: string;
}

function readCache(cacheFile: string): CacheFile | null {
  try {
    return JSON.parse(readFileSync(cacheFile, "utf8")) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, signature: string): void {
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(
    cacheFile,
    `${JSON.stringify({ signature, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function main(): void {
  const docsRoot = process.cwd();
  const repoRoot = findRepoRoot(docsRoot);
  const outDir = join(docsRoot, "dist");
  const cacheFile = join(outDir, ".build-cache.json");

  const force =
    process.argv.includes("--force") || process.env.DOCS_FORCE_REBUILD === "1";

  const outputsExist =
    existsSync(join(outDir, "index.js")) &&
    existsSync(join(outDir, "index.d.ts"));

  const compilerIdentity = resolveCompilerIdentity(docsRoot);
  const entries = statEntries(repoRoot, collectDocsInputs(repoRoot, docsRoot));
  const signature = computeSignature(entries, compilerIdentity);

  if (!force && outputsExist) {
    const cached = readCache(cacheFile);
    if (cached?.signature === signature) {
      console.log(
        `[docs-build:cache] ${entries.length} input(s) unchanged since ${cached.builtAt} — skipping docs-compiler`,
      );
      return;
    }
  }

  run("docs-compiler", ["gen"], docsRoot);
  run("docs-compiler", [], docsRoot);

  // Cache the signature computed BEFORE compiling, not after: `gen` only
  // writes into `docs/*/reference/`, which `collectDocsInputs` never walks
  // (skipped as a generated dir, same as `dist`), so re-signing afterward
  // would just redo the same walk for the same answer.
  writeCache(cacheFile, signature);
}

// Runs only when executed directly (`tsx scripts/cached-build.ts`), not when
// a test imports this module for its other exports.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
