/**
 * The cache-key half of `cached-build.ts`, split out so it can be unit
 * tested without touching the filesystem — see `signature.test.ts`.
 *
 * `docs-compiler` (Backstage) reads three kinds of input for a full build:
 * this package's own hand-written markdown/frontmatter, every `.ts`/`.tsx`
 * under `apps/*​/src` and `packages/*​/src` (the reference generator's scope,
 * see Backstage's `docs-compiler/src/gen/program.ts`), and the
 * study-group-finder Dart sources its Flutter-side extractor reads. None of
 * that can change here — `docs-compiler` is a published `@devdogsuga/*`
 * package this repo only consumes — so instead of teaching the compiler to
 * cache itself, `cached-build.ts` fingerprints its inputs from the outside
 * and skips the ~13s `gen && compile` pass when the fingerprint matches the
 * one recorded after the last real run.
 *
 * `FileEntry.mtimeMs`/`size` rather than a content hash: `docs-compiler`'s
 * own scope already walks a few hundred TypeScript files and builds a
 * `ts.Program` over them (the actual expensive part), so re-reading every
 * byte of every candidate file just to decide whether to skip that would
 * undercut the point. `stat()` is what `docs-compiler` was going to do
 * anyway as the first step of reading each file.
 */
import { createHash } from "node:crypto";

/** One watched input, relative to the repo root (stable across machines/
 * checkout paths, unlike an absolute path). */
export interface FileEntry {
  relPath: string;
  mtimeMs: number;
  size: number;
}

/**
 * Combines the input file stats with the resolved `@devdogsuga/docs-compiler`
 * install identity into one signature. Order-independent: callers may pass
 * `entries` in any order (directory-walk order is not guaranteed stable
 * across platforms), and this sorts by `relPath` before hashing so the
 * result only depends on the set of (path, mtime, size) triples, not how it
 * was discovered.
 *
 * `compilerIdentity` is a separate, deliberately opaque string — normally
 * `resolveCompilerIdentity()`'s realpath of the installed package — rather
 * than folded into the file list, so its meaning stays obvious at a glance
 * in `computeSignature`'s callers and in tests.
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
    hash.update(entry.relPath);
    hash.update("\0");
    hash.update(String(entry.mtimeMs));
    hash.update("\0");
    hash.update(String(entry.size));
    hash.update("\n");
  }
  hash.update("compiler\0");
  hash.update(compilerIdentity);
  return hash.digest("hex");
}
