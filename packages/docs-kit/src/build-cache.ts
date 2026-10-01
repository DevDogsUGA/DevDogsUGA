/**
 * The cache behind `docs-kit build`: a fingerprint of everything
 * `docs-kit gen && docs-kit` reads, so a build whose inputs have not
 * changed since the last successful one can skip both.
 *
 * Why it exists at all: a full build costs ~13-16s, almost all of it `gen`
 * building one `ts.Program` per package, and a content package's `build` runs
 * at the start of every `pnpm dev` even though a docs edit is rare. A hit
 * costs the walk-and-stat below, well under a second.
 *
 * A hit is only ever a hit when the compiler's own output would have been
 * byte-identical, so `pnpm build` and CI take the same cache as `pnpm dev`.
 * `--force` (or `DOCS_FORCE_REBUILD=1`) bypasses it for anyone ruling the
 * cache out as a suspect.
 *
 * What is watched, and why each:
 *
 * - every file under the content root, minus `dist/`, `node_modules/` and the
 *   `<project>/reference/` trees `gen` itself writes;
 * - the generator's source scope, taken from `gen/scope.ts` so the two cannot
 *   drift, plus each package's `package.json` (its `exports` map decides what
 *   is public) and `tsconfig.json`;
 * - `pnpm-workspace.yaml`, the root `package.json` and every workspace
 *   package's `package.json`, which `command-check.ts` checks scripts against;
 * - `pnpm-lock.yaml`, which moves whenever a dependency does, including the
 *   `@devdogsuga/config` presets a `tsconfig` extends;
 * - the CLI-override variables (`cli-catalog.ts`), so pointing the command
 *   check at another build misses. The published CLIs' own command lists are
 *   NOT inputs: they live on npm, so a hit can predate a publish, and CI,
 *   which starts with no `dist/`, always runs the check;
 * - this compiler's own identity, so an upgrade or a local rebuild misses.
 *
 * Stats, not content hashes: `gen` builds a `ts.Program` over a few hundred
 * files, and re-reading every byte of them just to decide whether to skip that
 * would undercut the point. Over-watching costs one unnecessary rebuild;
 * under-watching ships stale docs, which is the failure every choice here is
 * made against.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cliOverrides } from "./cli-catalog.js";
import { sourceFilesUnder } from "./gen/scope.js";
import { discoverWorkspacePackages, findWorkspaceRoot } from "./workspace.js";

/** One watched input, relative to the repo root so the key survives a move. */
export interface FileEntry {
  relPath: string;
  mtimeMs: number;
  size: number;
}

/** What `docs-kit build` needs from the cache, decided before it runs. */
export interface BuildCache {
  /** How many inputs the fingerprint covers, for the log line. */
  inputs: number;
  /** When the matching build ran, or null on a miss. */
  hitFrom: string | null;
  /** Records this fingerprint; call only after a build that succeeded. */
  record(): void;
}

/** Directories under the content root that are output, not input. */
const CONTENT_SKIP = new Set(["dist", "node_modules"]);

/** Where `gen` writes, one level below the content root. */
const REFERENCE_SEGMENT = "reference";

/**
 * Combines the input stats and the compiler's identity into one signature.
 * Order-independent: a directory walk's order is not stable across platforms,
 * so entries are sorted by path before hashing.
 */
export function computeSignature(
  entries: readonly FileEntry[],
  compilerIdentity: string,
): string {
  const sorted = [...entries].sort((a, b) =>
    a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
  );

  const hash = createHash("sha256");
  for (const entry of sorted) {
    hash.update(`${entry.relPath}\0${entry.mtimeMs}\0${entry.size}\n`);
  }
  hash.update(`compiler\0${compilerIdentity}`);
  return hash.digest("hex");
}

/** Every file a full build of `contentRoot` reads, absolute. */
export function collectInputs(repoRoot: string, contentRoot: string): string[] {
  const files: string[] = [];

  walkContent(contentRoot, contentRoot, files);

  const packagesDir = path.join(repoRoot, "packages");
  for (const name of childDirectories(packagesDir)) {
    const absDir = path.join(packagesDir, name);
    const srcDir = path.join(absDir, "src");
    const manifest = path.join(absDir, "package.json");
    const tsconfig = path.join(absDir, "tsconfig.json");
    // The same three-file test `discoverTargets` applies.
    if (!isDirectory(srcDir) || !isFile(manifest) || !isFile(tsconfig)) {
      continue;
    }
    files.push(...sourceFilesUnder(srcDir), manifest, tsconfig);
  }

  files.push(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    path.join(repoRoot, "pnpm-lock.yaml"),
    path.join(repoRoot, "package.json"),
  );
  for (const pkg of discoverWorkspacePackages(repoRoot)) {
    files.push(path.join(repoRoot, pkg.dir, "package.json"));
  }

  // A package's manifest is reached twice, once as a generator target and once
  // as a workspace package; counting it twice would be harmless but noisy.
  return [...new Set(files)];
}

/** Reads the cache for `contentRoot` and fingerprints its current inputs. */
export function openBuildCache(contentRoot: string): BuildCache {
  const repoRoot = findWorkspaceRoot(contentRoot);
  if (repoRoot === null) {
    throw new Error(`no pnpm-workspace.yaml above ${contentRoot}`);
  }

  const outDir = path.join(contentRoot, "dist");
  const cacheFile = path.join(outDir, ".build-cache.json");

  const entries = statEntries(repoRoot, collectInputs(repoRoot, contentRoot));
  const { devtools, backstage } = cliOverrides();
  const signature = computeSignature(
    entries,
    `${compilerIdentity()}|${devtools}|${backstage}`,
  );

  const outputsExist =
    isFile(path.join(outDir, "index.js")) &&
    isFile(path.join(outDir, "index.d.ts"));
  const cached = outputsExist ? readCache(cacheFile) : null;

  return {
    inputs: entries.length,
    hitFrom: cached?.signature === signature ? cached.builtAt : null,
    // The signature computed BEFORE building is the one recorded: `gen` only
    // writes into `reference/` trees and the compile only into `dist/`, and
    // neither is watched, so re-signing afterward would get the same answer.
    record: () => writeCache(cacheFile, signature),
  };
}

/**
 * Changes whenever this compiler would produce different output: a new
 * published version resolves to a new store path, and a local rebuild of a
 * linked copy moves `dist/cli.js`'s mtime even when the version does not.
 */
function compilerIdentity(): string {
  const packageDir = fileURLToPath(new URL("..", import.meta.url));
  try {
    const real = fs.realpathSync(packageDir);
    const { version } = JSON.parse(
      fs.readFileSync(path.join(real, "package.json"), "utf-8"),
    ) as { version?: string };
    const built = fs.statSync(path.join(real, "dist", "cli.js")).mtimeMs;
    return `${real}@${version ?? "unknown"}@${built}`;
  } catch {
    // Can't identify itself: always miss rather than trust a stale cache.
    return `unresolved:${Date.now()}:${Math.random()}`;
  }
}

function walkContent(root: string, dir: string, out: string[]): void {
  for (const entry of childEntries(dir)) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (CONTENT_SKIP.has(entry.name)) continue;
      if (entry.name === REFERENCE_SEGMENT && path.dirname(dir) === root) {
        continue;
      }
      walkContent(root, child, out);
    } else if (entry.isFile()) {
      out.push(child);
    }
  }
}

function statEntries(repoRoot: string, files: readonly string[]): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const file of files) {
    // A missing input (no lockfile yet) is simply absent
    // from the key; its later appearance changes the key.
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    entries.push({
      relPath: path.relative(repoRoot, file).replace(/\\/g, "/"),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  }
  return entries;
}

interface CacheRecord {
  signature: string;
  builtAt: string;
}

function readCache(cacheFile: string): CacheRecord | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as CacheRecord;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, signature: string): void {
  const record: CacheRecord = { signature, builtAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, `${JSON.stringify(record, null, 2)}\n`);
}

function isDirectory(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function childEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function childDirectories(dir: string): string[] {
  return childEntries(dir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
