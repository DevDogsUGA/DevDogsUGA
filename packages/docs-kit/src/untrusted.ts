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
 * - The verified bytes are copied into a fresh private directory and compiled
 *   from there, so the source tree is not read again after it was checked.
 * - Author HTML and SVG pass the `untrusted` allowlist (html-policy.ts); SVG
 *   assets pass the same one. Every image and link must resolve to an approved
 *   asset or page inside the docs directory; external links get
 *   `rel="noopener noreferrer nofollow"` and only http(s) and mailto work.
 *
 * Fetching the source, building candidates, previews and publishing are not
 * here. This takes a directory that something else already fetched.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compileDocs, renderPages } from "./compile.js";
import { DocsBuildError } from "./errors.js";
import { parseDocFile } from "./parse.js";
import { checkSvgAsset, type RenderPolicy } from "./sanitize.js";
import type { DocsFolder, DocsPage, DocsProject } from "./types.js";

export interface UntrustedLimits {
  /** Files of any kind, including the manifest. */
  maxFiles: number;
  /** Markdown pages. */
  maxPages: number;
  /** One markdown file, in bytes. */
  maxMarkdownBytes: number;
  /** One image asset, in bytes. */
  maxAssetBytes: number;
  /** Everything together, in bytes. */
  maxTotalBytes: number;
  /** Folder nesting below the docs directory. */
  maxDepth: number;
  /** A path relative to the docs directory, in characters. */
  maxPathLength: number;
}

export const DEFAULT_UNTRUSTED_LIMITS: UntrustedLimits = {
  maxFiles: 300,
  maxPages: 200,
  maxMarkdownBytes: 256 * 1024,
  maxAssetBytes: 2 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  maxDepth: 6,
  maxPathLength: 160,
};

/** The one manifest file, at the top of the docs directory. */
export const MANIFEST_FILE = "docs.manifest.json";

/** Asset types and the signatures their bytes must start with. */
const ASSET_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/** Frontmatter keys a project's page may set; anything else is refused. */
const FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "order",
  "section",
  "steps",
  "os",
]);

const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export interface UntrustedManifest {
  version: 1;
  name?: string;
  description?: string;
}

export interface UntrustedAsset {
  /** Relative to the docs directory, posix. */
  path: string;
  type: string;
  bytes: number;
  sha256: string;
}

export interface UntrustedCompileResult {
  project: DocsProject;
  pages: DocsPage[];
  folders: DocsFolder[];
  assets: UntrustedAsset[];
  manifest: UntrustedManifest | null;
}

export interface UntrustedCompileOptions {
  /** The project slug the pages are emitted under. Chosen by the platform, not the source. */
  project: string;
  limits?: Partial<UntrustedLimits>;
}

interface Scanned {
  rel: string;
  kind: "page" | "asset" | "manifest";
  bytes: Buffer;
}

function reject(rel: string, message: string): never {
  throw new DocsBuildError(`${rel === "" ? "docs" : rel}: ${message}`);
}

/**
 * Reads every file under `root` into memory, refusing anything that is not a
 * plain, small, well-named Markdown file, approved image or the manifest.
 */
function scan(root: string, limits: UntrustedLimits): Scanned[] {
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat) reject("", `the docs directory ${root} doesn't exist`);
  if (rootStat.isSymbolicLink()) {
    reject("", "the docs directory is a symlink, which isn't allowed");
  }
  if (!rootStat.isDirectory()) reject("", "the docs path isn't a directory");

  const found: Scanned[] = [];
  let total = 0;
  let pages = 0;

  const walk = (dir: string, rel: string, depth: number): void => {
    if (depth > limits.maxDepth) {
      reject(rel, `is nested deeper than ${limits.maxDepth} folders`);
    }
    for (const name of fs.readdirSync(dir).sort()) {
      const relPath = rel === "" ? name : `${rel}/${name}`;
      const full = path.join(dir, name);

      if (relPath.length > limits.maxPathLength) {
        reject(
          relPath.slice(0, 60) + "…",
          `path is longer than ${limits.maxPathLength} characters`,
        );
      }
      if (!SAFE_NAME.test(name)) {
        reject(
          relPath,
          "has a file name outside A-Z a-z 0-9 . _ - (and not starting with . or -); rename it",
        );
      }

      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        reject(relPath, "is a symlink, which isn't allowed in docs");
      }
      if (stat.isDirectory()) {
        if (name === "_shared") {
          reject(relPath, "`_shared` is reserved for the club's own docs");
        }
        walk(full, relPath, depth + 1);
        continue;
      }
      if (!stat.isFile()) reject(relPath, "isn't a regular file");

      if (found.length >= limits.maxFiles) {
        reject(relPath, `exceeds the limit of ${limits.maxFiles} files`);
      }

      const ext = path.extname(name).toLowerCase();
      const isManifest = rel === "" && name === MANIFEST_FILE;
      const isPage = ext === ".md";
      const assetType = ASSET_TYPES[ext];
      if (!isManifest && !isPage && assetType === undefined) {
        reject(
          relPath,
          `has a file type that docs can't contain (allowed: .md, ${Object.keys(ASSET_TYPES).join(" ")}, and ${MANIFEST_FILE} at the top)`,
        );
      }

      const cap =
        isPage || isManifest
          ? isManifest
            ? 16 * 1024
            : limits.maxMarkdownBytes
          : limits.maxAssetBytes;
      if (stat.size > cap) {
        reject(
          relPath,
          `is ${stat.size} bytes, over the ${cap}-byte limit for this kind of file`,
        );
      }
      total += stat.size;
      if (total > limits.maxTotalBytes) {
        reject(
          relPath,
          `takes the docs over the ${limits.maxTotalBytes}-byte total limit`,
        );
      }
      if (isPage && ++pages > limits.maxPages) {
        reject(relPath, `exceeds the limit of ${limits.maxPages} pages`);
      }

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

      found.push({
        rel: relPath,
        kind: isManifest ? "manifest" : isPage ? "page" : "asset",
        bytes,
      });
    }
  };
  walk(root, "", 0);
  return found;
}

function startsWith(bytes: Buffer, ...signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

/** Whether the bytes are what the extension claims, so an HTML file can't pose as a `.png`. */
function matchesType(ext: string, bytes: Buffer): boolean {
  switch (ext) {
    case ".png":
      return startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case ".jpg":
    case ".jpeg":
      return startsWith(bytes, 0xff, 0xd8, 0xff);
    case ".gif":
      return ["GIF87a", "GIF89a"].includes(
        bytes.subarray(0, 6).toString("latin1"),
      );
    case ".webp":
      return (
        bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
        bytes.subarray(8, 12).toString("latin1") === "WEBP"
      );
    case ".avif":
      return (
        bytes.subarray(4, 8).toString("latin1") === "ftyp" &&
        /avif|avis/.test(bytes.subarray(8, 32).toString("latin1"))
      );
    default:
      return false;
  }
}

/** The manifest: strict JSON with a fixed set of keys. */
function readManifest(bytes: Buffer): UntrustedManifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf-8"));
  } catch {
    reject(MANIFEST_FILE, "isn't valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    reject(MANIFEST_FILE, "must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!["version", "name", "description"].includes(key)) {
      reject(
        MANIFEST_FILE,
        `has an unknown key "${key}" (allowed: version, name, description)`,
      );
    }
  }
  if (record["version"] !== 1) reject(MANIFEST_FILE, `"version" must be 1`);
  const manifest: UntrustedManifest = { version: 1 };
  for (const key of ["name", "description"] as const) {
    const field = record[key];
    if (field === undefined) continue;
    if (typeof field !== "string" || field.length > 300) {
      reject(
        MANIFEST_FILE,
        `"${key}" must be a string of at most 300 characters`,
      );
    }
    manifest[key] = field;
  }
  return manifest;
}

/** Deepest blockquote or indentation nesting a page may use. */
const MAX_NESTING = 32;

/**
 * Cheap checks before a page reaches the parser: hostile nesting (a megabyte of
 * `>` or `<div>`) makes Markdown and HTML parsers recurse or go quadratic, and
 * the size cap alone doesn't stop that.
 */
function checkShape(rel: string, text: string): void {
  if (text.includes("\0")) reject(rel, "contains a NUL byte");
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    const prefix = /^[\s>]*/.exec(line)![0];
    const quotes = prefix.split(">").length - 1;
    if (quotes > MAX_NESTING || prefix.length - quotes > 256) {
      reject(
        `${rel}:${index + 1}`,
        `is nested more than ${MAX_NESTING} levels deep`,
      );
    }
  }
  const opens = text.match(/<[a-zA-Z]/g)?.length ?? 0;
  if (opens > 5000) {
    reject(
      rel,
      `has ${opens} HTML tags; docs pages are Markdown, not HTML documents`,
    );
  }
}

/** Frontmatter keys outside the allowlist: `mount`, `scheduled`, anything that steers the build. */
function checkFrontmatter(rel: string, source: string): void {
  const parsed = parseDocFile(source, rel);
  for (const key of Object.keys(parsed.frontmatter)) {
    if (!FRONTMATTER_KEYS.has(key)) {
      reject(
        rel,
        `frontmatter key "${key}" isn't allowed in project docs (allowed: ${[...FRONTMATTER_KEYS].join(", ")})`,
      );
    }
  }
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
  const project = options.project;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project)) {
    throw new DocsBuildError(
      `project "${project}" isn't a valid slug (lowercase letters, digits and hyphens)`,
    );
  }

  const files = scan(path.resolve(docsDir), limits);

  const assets: UntrustedAsset[] = [];
  let manifest: UntrustedManifest | null = null;
  for (const file of files) {
    if (file.kind === "manifest") manifest = readManifest(file.bytes);
    if (file.kind === "page") {
      const text = file.bytes.toString("utf-8");
      checkShape(file.rel, text);
      checkFrontmatter(file.rel, text);
    }
    if (file.kind === "asset") {
      const ext = path.extname(file.rel).toLowerCase();
      if (ext === ".svg") {
        checkSvgAsset(file.bytes.toString("utf-8"), file.rel);
      } else if (!matchesType(ext, file.bytes)) {
        reject(
          file.rel,
          `isn't really a ${ext.slice(1)} image (its first bytes say otherwise)`,
        );
      }
      assets.push({
        path: file.rel,
        type: ASSET_TYPES[ext]!,
        bytes: file.bytes.length,
        sha256: crypto.createHash("sha256").update(file.bytes).digest("hex"),
      });
    }
  }
  if (!files.some((f) => f.kind === "page")) {
    throw new DocsBuildError("docs: the directory contains no Markdown pages");
  }

  // Compile from a private copy of the verified bytes.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "docs-untrusted-"));
  try {
    for (const file of files) {
      if (file.kind === "manifest") continue;
      const target = path.join(staging, project, ...file.rel.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.bytes);
    }

    const assetPaths = new Set(assets.map((a) => a.path));
    const policyFor = (page: { path: string }): RenderPolicy => ({
      trust: "untrusted",
      untrusted: {
        project,
        dir: page.path.split("/").slice(1, -1).join("/"),
        assets: assetPaths,
      },
    });

    let compiled;
    try {
      compiled = compileDocs(staging);
      const pages = await renderPages(compiled.pages, policyFor);
      const root = compiled.projects[0];
      if (!root) throw new DocsBuildError("docs: no project was produced");
      if (manifest?.name !== undefined) root.name = manifest.name;
      if (manifest?.description !== undefined)
        root.description = manifest.description;
      return {
        project: root,
        pages,
        folders: compiled.folders,
        assets,
        manifest,
      };
    } catch (error) {
      if (error instanceof DocsBuildError) throw error;
      // A parser that ran out of stack on a hostile page, say.
      throw new DocsBuildError(
        `docs: a page could not be compiled (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); is it nested absurdly deep?`,
      );
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
