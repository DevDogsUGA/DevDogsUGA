/**
 * Compiling documentation that came from a project repository.
 *
 * The club's own docs are reviewed in pull requests to this repository and
 * compiled by `compileDocs`. Docs fetched from a project's repository are not:
 * whoever can merge there can write anything. This is the compile mode for
 * them, and its contract is a trust boundary (see the README):
 *
 * - It reads Markdown, approved image assets and one fixed manifest, and
 *   nothing else. It never runs a project's scripts, never installs its
 *   dependencies, never loads a plugin, and never reads a config file that
 *   changes how the compiler behaves. The compiler, its plugins and its
 *   policy are this package's, pinned by the platform.
 * - Every file must be a plain file inside the docs directory: no symlinks
 *   (`lstat`, and opened with `O_NOFOLLOW`), no special files, no `..`, no
 *   absolute paths, no odd file names, with caps on file count, size and depth.
 * - The verified bytes are read into memory once and compiled from there, so
 *   the source tree is not read again after it was checked.
 * - Author HTML and SVG pass the `untrusted` allowlist (html-policy.ts); SVG
 *   assets pass the same one. Every image and link must resolve to an approved
 *   asset or page inside the docs directory; external links get
 *   `rel="noopener noreferrer nofollow"` and only http(s) and mailto work.
 *
 * This file is the directory half: it walks a directory that something else
 * already fetched and renders with Shiki. Every rule is in
 * `untrusted-policy.ts`, which the platform's live preview shares (it gets its
 * files from the GitHub API and cannot run Shiki). Fetching the source,
 * building candidates, previews and publishing are not here.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { renderBody } from "./render.js";
import {
  checkDepth,
  checkDirectoryName,
  checkName,
  classifyFile,
  compileUntrustedFiles,
  reject,
  TreeBudget,
  type UntrustedCompileOptions,
  type UntrustedCompileResult,
  type UntrustedFile,
  type UntrustedLimits,
  DEFAULT_UNTRUSTED_LIMITS,
} from "./untrusted-policy.js";

export {
  DEFAULT_UNTRUSTED_LIMITS,
  MANIFEST_FILE,
  type UntrustedAsset,
  type UntrustedCompileOptions,
  type UntrustedCompileResult,
  type UntrustedLimits,
  type UntrustedManifest,
} from "./untrusted-policy.js";

/**
 * Reads every file under `root` into memory, refusing anything that is not a
 * plain, small, well-named Markdown file, approved image or the manifest.
 */
function scan(root: string, limits: UntrustedLimits): UntrustedFile[] {
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat) reject("", `the docs directory ${root} doesn't exist`);
  if (rootStat.isSymbolicLink()) {
    reject("", "the docs directory is a symlink, which isn't allowed");
  }
  if (!rootStat.isDirectory()) reject("", "the docs path isn't a directory");

  const found: UntrustedFile[] = [];
  // Files and directories both count: a tree of a million empty folders costs
  // the scan as much as a million files.
  const budget = new TreeBudget(limits);

  const walk = (dir: string, rel: string, depth: number): void => {
    checkDepth(rel, depth, limits);
    // Read at most the allowance (not the whole listing) so a directory with
    // millions of entries is refused without being loaded.
    const names: string[] = [];
    const handle = fs.opendirSync(dir);
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        names.push(entry.name);
        // Counted one at a time, so the limit trips before the listing is read.
        if (names.length > limits.maxFiles)
          budget.addEntries(names.length, rel);
      }
    } finally {
      handle.closeSync();
    }
    budget.addEntries(names.length, rel);
    for (const name of names.sort()) {
      const relPath = rel === "" ? name : `${rel}/${name}`;
      const full = path.join(dir, name);

      checkName(relPath, name, limits);

      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        reject(relPath, "is a symlink, which isn't allowed in docs");
      }
      if (stat.isDirectory()) {
        checkDirectoryName(relPath, name);
        walk(full, relPath, depth + 1);
        continue;
      }
      if (!stat.isFile()) reject(relPath, "isn't a regular file");

      const { kind, cap } = classifyFile(relPath, name, rel === "", limits);
      budget.addFile(relPath, kind, stat.size, cap);

      // O_NOFOLLOW closes the gap between the lstat above and this read.
      let fd: number;
      try {
        fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      } catch {
        reject(relPath, "changed while it was being read, or is a symlink");
      }
      let bytes: Buffer;
      try {
        const opened = fs.fstatSync(fd);
        if (!opened.isFile() || opened.size > cap) {
          reject(relPath, "changed while it was being read");
        }
        bytes = Buffer.alloc(opened.size);
        let read = 0;
        while (read < bytes.length) {
          const n = fs.readSync(fd, bytes, read, bytes.length - read, read);
          if (n === 0) break;
          read += n;
        }
        if (read !== bytes.length)
          reject(relPath, "changed while it was being read");
      } finally {
        fs.closeSync(fd);
      }

      found.push({ rel: relPath, kind, bytes });
    }
  };
  walk(root, "", 0);
  return found;
}

/**
 * Reads `docsDir` the way `compileUntrustedDocs` does and returns its files,
 * for callers that want to analyse them rather than compile. Throws the same
 * `DocsBuildError` for anything the tree rules refuse.
 */
export function scanUntrustedDocs(
  docsDir: string,
  limits: Partial<UntrustedLimits> = {},
): UntrustedFile[] {
  return scan(path.resolve(docsDir), {
    ...DEFAULT_UNTRUSTED_LIMITS,
    ...limits,
  });
}

/**
 * Compiles `docsDir` as untrusted project documentation. Throws a
 * `DocsBuildError` naming the file (and the line, for markup) on anything the
 * policy refuses.
 */
export async function compileUntrustedDocs(
  docsDir: string,
  options: UntrustedCompileOptions,
): Promise<UntrustedCompileResult> {
  const limits = { ...DEFAULT_UNTRUSTED_LIMITS, ...options.limits };
  const files = scan(path.resolve(docsDir), limits);
  return compileUntrustedFiles(files, options, renderBody);
}
