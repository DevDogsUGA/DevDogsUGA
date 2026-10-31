/**
 * The rules for documentation that came from a project repository, with no
 * file system and no highlighter in them.
 *
 * `untrusted.ts` reads a directory and compiles it (the candidate pipeline and
 * `devtools docs check`); the platform's live preview gets its files from the
 * GitHub API and compiles them in a Worker. Both end up here, so "what a
 * project's docs may contain" is written once:
 *
 * - names, file types, sizes and counts (`classifyFile`, `TreeBudget`,
 *   `checkTreeEntries`, which the directory scan and a GitHub tree both use);
 * - what a file's bytes must be (`analyzeUntrustedFiles`): an image that is
 *   really an image, an SVG on the allowlist, Markdown that parses, front
 *   matter keys on the list, the manifest's fixed shape;
 * - compiling the pages with the `untrusted` HTML policy, and the link check.
 *
 * The renderer is a parameter: Shiki's in the build, the plain one in the
 * Worker (`render-plain.ts`). Nothing here imports either, nor `node:fs`.
 */
import {
  compileContent,
  memorySource,
  renderPagesWith,
} from "./compile-core.js";
import { DocsBuildError } from "./errors.js";
import { checkLinks, type LinkCheckError } from "./link-check.js";
import { parseDocFile } from "./parse.js";
import type { BodyRenderer } from "./render-pipeline.js";
import { checkSvgAsset, idPrefixFor, type RenderPolicy } from "./sanitize.js";
import type { DocsFolder, DocsPage, DocsProject } from "./types.js";

export interface UntrustedLimits {
  /** Files of any kind, including the manifest, plus directories. */
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

/** The manifest's own size cap, in bytes. */
const MAX_MANIFEST_BYTES = 16 * 1024;

/** Asset types and the signatures their bytes must start with. */
export const ASSET_TYPES: Readonly<Record<string, string>> = {
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
  /**
   * Internal links that resolve to nothing. The renderer leaves such a link as
   * written, so this is where it is caught; the candidate's checks and the
   * readiness check both fail on a non-empty list.
   */
  linkErrors: LinkCheckError[];
}

export interface UntrustedCompileOptions {
  /** The project slug the pages are emitted under. Chosen by the platform, not the source. */
  project: string;
  limits?: Partial<UntrustedLimits>;
}

/** A file that passed the name, type and size rules, tagged with what it is. */
export interface UntrustedFile {
  /** Relative to the docs directory, posix. */
  rel: string;
  kind: "page" | "asset" | "manifest";
  bytes: Uint8Array;
}

/** One thing the policy refused, with the file it is about. */
export interface UntrustedProblem {
  /** The file (and line, for markup) when there is one; "docs" otherwise. */
  file: string;
  message: string;
}

export function reject(rel: string, message: string): never {
  throw new DocsBuildError(`${rel === "" ? "docs" : rel}: ${message}`);
}

/** The extension of a file name, lower case, with its dot; "" when it has none. */
export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/** The path-length and file-name rules; throws on the first. */
export function checkName(
  relPath: string,
  name: string,
  limits: UntrustedLimits,
): void {
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
}

/** The one rule about a directory's name. */
export function checkDirectoryName(relPath: string, name: string): void {
  if (name === "_shared") {
    reject(relPath, "`_shared` is reserved for the club's own docs");
  }
}

/**
 * What a regular file is allowed to be, by its name and place: a page, an
 * image, or the manifest at the top. Throws for anything else. `cap` is the
 * most bytes a file of that kind may have.
 */
export function classifyFile(
  relPath: string,
  name: string,
  topLevel: boolean,
  limits: UntrustedLimits,
): { kind: UntrustedFile["kind"]; cap: number } {
  const ext = extOf(name);
  const isManifest = topLevel && name === MANIFEST_FILE;
  const isPage = ext === ".md";
  if (!isManifest && !isPage && ASSET_TYPES[ext] === undefined) {
    reject(
      relPath,
      `has a file type that docs can't contain (allowed: .md, ${Object.keys(ASSET_TYPES).join(" ")}, and ${MANIFEST_FILE} at the top)`,
    );
  }
  return {
    kind: isManifest ? "manifest" : isPage ? "page" : "asset",
    cap: isManifest
      ? MAX_MANIFEST_BYTES
      : isPage
        ? limits.maxMarkdownBytes
        : limits.maxAssetBytes,
  };
}

/**
 * The running totals a directory walk or a tree listing is held to: how many
 * files and directories, how many pages, how many bytes. Each method throws
 * the moment a limit is crossed.
 */
export class TreeBudget {
  private entries = 0;
  private total = 0;
  private pages = 0;
  constructor(private readonly limits: UntrustedLimits) {}

  /** `count` more files or directories were seen (in the directory `rel`). */
  addEntries(count: number, rel: string): void {
    this.entries += count;
    if (this.entries > this.limits.maxFiles) {
      reject(
        rel,
        `exceeds the limit of ${this.limits.maxFiles} files and directories`,
      );
    }
  }

  /** A file of `size` bytes: checked against its kind's cap and the totals. */
  addFile(
    relPath: string,
    kind: UntrustedFile["kind"],
    size: number,
    cap: number,
  ): void {
    if (size > cap) {
      reject(
        relPath,
        `is ${size} bytes, over the ${cap}-byte limit for this kind of file`,
      );
    }
    this.total += size;
    if (this.total > this.limits.maxTotalBytes) {
      reject(
        relPath,
        `takes the docs over the ${this.limits.maxTotalBytes}-byte total limit`,
      );
    }
    if (kind === "page" && ++this.pages > this.limits.maxPages) {
      reject(relPath, `exceeds the limit of ${this.limits.maxPages} pages`);
    }
  }
}

/** A directory's depth rule: `depth` is 0 for the docs directory itself. */
export function checkDepth(
  rel: string,
  depth: number,
  limits: UntrustedLimits,
): void {
  if (depth > limits.maxDepth) {
    reject(rel, `is nested deeper than ${limits.maxDepth} folders`);
  }
}

/** One entry of a repository tree, as GitHub lists it (`mode` already mapped). */
export interface TreeEntry {
  /** Relative to the docs directory, posix. */
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  /** Bytes, for a file; 0 otherwise. */
  size: number;
}

/**
 * Holds a listed tree to the same rules the directory scan applies while it
 * reads (names, nesting, types, sizes, counts), before a byte of any file is
 * fetched. Returns each regular file's kind, for the fetch to use. Throws on
 * the first refusal.
 */
export function checkTreeEntries(
  entries: readonly TreeEntry[],
  limits: Partial<UntrustedLimits> = {},
): Map<string, UntrustedFile["kind"]> {
  const effective = { ...DEFAULT_UNTRUSTED_LIMITS, ...limits };
  const budget = new TreeBudget(effective);
  budget.addEntries(entries.length, "");
  const kinds = new Map<string, UntrustedFile["kind"]>();
  for (const entry of [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    const segments = entry.path.split("/");
    const name = segments.at(-1)!;
    checkName(entry.path, name, effective);
    if (entry.type === "symlink") {
      reject(entry.path, "is a symlink, which isn't allowed in docs");
    }
    if (entry.type === "dir") {
      checkDirectoryName(entry.path, name);
      checkDepth(entry.path, segments.length, effective);
      continue;
    }
    if (entry.type !== "file") reject(entry.path, "isn't a regular file");
    checkDepth(entry.path, segments.length - 1, effective);
    const { kind, cap } = classifyFile(
      entry.path,
      name,
      segments.length === 1,
      effective,
    );
    budget.addFile(entry.path, kind, entry.size, cap);
    kinds.set(entry.path, kind);
  }
  return kinds;
}

function startsWith(bytes: Uint8Array, ...signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

function latin1(bytes: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let i = from; i < Math.min(to, bytes.length); i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

/** Whether the bytes are what the extension claims, so an HTML file can't pose as a `.png`. */
function matchesType(ext: string, bytes: Uint8Array): boolean {
  switch (ext) {
    case ".png":
      return startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case ".jpg":
    case ".jpeg":
      return startsWith(bytes, 0xff, 0xd8, 0xff);
    case ".gif":
      return ["GIF87a", "GIF89a"].includes(latin1(bytes, 0, 6));
    case ".webp":
      return latin1(bytes, 0, 4) === "RIFF" && latin1(bytes, 8, 12) === "WEBP";
    case ".avif":
      return (
        latin1(bytes, 4, 8) === "ftyp" && /avif|avis/.test(latin1(bytes, 8, 32))
      );
    default:
      return false;
  }
}

const utf8 = new TextDecoder();

/** The manifest: strict JSON with a fixed set of keys. */
function readManifest(bytes: Uint8Array): UntrustedManifest {
  let value: unknown;
  try {
    value = JSON.parse(utf8.decode(bytes));
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

/** Frontmatter keys outside the allowlist: `mount`, anything that steers the build. */
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

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** What a thrown value says, for a problem list. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface UntrustedAnalysis {
  /** Null when anything was refused. */
  result: UntrustedCompileResult | null;
  /** Everything refused, in the order it was found. Empty when `result` is set. */
  problems: UntrustedProblem[];
  /**
   * Internal links that resolve to nothing. Found as soon as the pages are
   * compiled, so they are here even when a page then failed to render; empty
   * only if the pages never got that far.
   */
  linkErrors: LinkCheckError[];
}

/**
 * Checks and compiles a project's docs, collecting what the policy refuses
 * rather than stopping at the first thing: every file that fails its checks,
 * and every page the renderer refuses. A refusal in the shape of the tree
 * itself (a page set that doesn't compile as a project) ends the pass, because
 * nothing after it can run.
 *
 * `files` have already passed the name, type and size rules
 * (`checkTreeEntries`, or the directory scan).
 */
export async function analyzeUntrustedFiles(
  files: readonly UntrustedFile[],
  options: UntrustedCompileOptions,
  render: BodyRenderer,
): Promise<UntrustedAnalysis> {
  const project = options.project;
  const problems: UntrustedProblem[] = [];
  const refuse = (error: unknown, file: string): void => {
    if (!(error instanceof DocsBuildError)) throw error;
    problems.push({ file, message: error.message });
  };

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project)) {
    throw new DocsBuildError(
      `project "${project}" isn't a valid slug (lowercase letters, digits and hyphens)`,
    );
  }

  const assets: UntrustedAsset[] = [];
  let manifest: UntrustedManifest | null = null;
  for (const file of files) {
    try {
      if (file.kind === "manifest") manifest = readManifest(file.bytes);
      if (file.kind === "page") {
        const text = utf8.decode(file.bytes);
        checkShape(file.rel, text);
        checkFrontmatter(file.rel, text);
      }
      if (file.kind === "asset") {
        const ext = extOf(file.rel);
        if (ext === ".svg") {
          checkSvgAsset(utf8.decode(file.bytes), file.rel);
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
          sha256: await sha256(file.bytes),
        });
      }
    } catch (error) {
      refuse(error, file.rel);
    }
  }
  if (!files.some((f) => f.kind === "page")) {
    problems.push({
      file: "docs",
      message: "docs: the directory contains no Markdown pages",
    });
  }
  if (problems.length > 0) return { result: null, problems, linkErrors: [] };

  // Compile from the verified bytes, in memory: the source is not read again.
  const sources = new Map<string, string>();
  for (const file of files) {
    if (file.kind === "page") {
      sources.set(`${project}/${file.rel}`, utf8.decode(file.bytes));
    }
  }

  let compiled;
  try {
    compiled = compileContent(memorySource(sources));
  } catch (error) {
    if (!(error instanceof DocsBuildError)) {
      throw new DocsBuildError(
        `docs: a page could not be compiled (${messageOf(error).split("\n")[0]}); is it nested absurdly deep?`,
      );
    }
    refuse(error, "docs");
    return { result: null, problems, linkErrors: [] };
  }
  const root = compiled.projects[0];
  if (!root) {
    problems.push({ file: "docs", message: "docs: no project was produced" });
    return { result: null, problems, linkErrors: [] };
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

  // Before rendering, and before the prefix below: the rendered pages share
  // their heading objects with the compiled ones, and anchors are checked
  // against the unprefixed ids.
  const linkErrors = checkLinks(compiled.pages);

  const rendered: DocsPage[] = [];
  for (const page of compiled.pages) {
    try {
      const [done] = await renderPagesWith(render, [page], policyFor);
      rendered.push(done!);
    } catch (error) {
      if (error instanceof DocsBuildError) {
        refuse(error, `${page.path.slice(project.length + 1)}.md`);
      } else {
        // A parser that ran out of stack on a hostile page, say.
        problems.push({
          file: `${page.path.slice(project.length + 1)}.md`,
          message: `docs: a page could not be compiled (${messageOf(error).split("\n")[0]}); is it nested absurdly deep?`,
        });
      }
    }
  }
  if (problems.length > 0) return { result: null, problems, linkErrors };

  // The pages' ids carry a per-project prefix (rehypePrefixIds); the
  // table of contents links to them, so it carries the same one.
  const prefix = idPrefixFor(project);
  for (const page of rendered) {
    for (const heading of page.headings) heading.id = prefix + heading.id;
  }
  if (manifest?.name !== undefined) root.name = manifest.name;
  if (manifest?.description !== undefined)
    root.description = manifest.description;
  return {
    result: {
      project: root,
      pages: rendered,
      folders: compiled.folders,
      assets,
      manifest,
      linkErrors,
    },
    problems: [],
    linkErrors,
  };
}

/**
 * `analyzeUntrustedFiles`, throwing a `DocsBuildError` with the first thing it
 * refused: the candidate pipeline's behaviour, where one refusal is enough to
 * stop.
 */
export async function compileUntrustedFiles(
  files: readonly UntrustedFile[],
  options: UntrustedCompileOptions,
  render: BodyRenderer,
): Promise<UntrustedCompileResult> {
  const { result, problems } = await analyzeUntrustedFiles(
    files,
    options,
    render,
  );
  if (result === null) throw new DocsBuildError(problems[0]!.message);
  return result;
}
