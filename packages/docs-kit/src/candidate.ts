/**
 * Turns a fetched project docs directory into a docs candidate: the immutable
 * thing a reviewer approves and the publisher then uploads, byte for byte.
 *
 * A candidate directory holds
 *
 * - `content/`: what gets published. `content.json` (the compiled project,
 *   pages, folders and asset list, with every id already prefixed), `search.json`
 *   (the search entries for those pages) and `assets/` (the verified bytes);
 * - `review/`: what a reviewer reads. `summary.md`, `checks.json` and a static
 *   `preview/` site (CSP-locked, no script) of the pages as they will render;
 * - `manifest.json`: the source (repository, branch, commit, directory), the
 *   destination, and a sha-256 per file of `content/` plus one digest over them
 *   all. The publisher recomputes it before uploading anything, and the digest
 *   is also passed between workflow jobs, so a swapped artifact doesn't publish.
 *
 * This runs the untrusted compiler (`untrusted.ts`) and nothing else: no
 * network, no credentials, no project code.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  linkProblems,
  overviewProblem,
  pageContentProblems,
} from "./readiness.js";
import {
  compileUntrustedDocs,
  type UntrustedCompileResult,
} from "./untrusted.js";

export interface CandidateSource {
  repository: string;
  branch: string;
  sha: string;
  /** The docs directory inside the repository. */
  directory: string;
  /** Where on the website the project's docs go (from the central map). */
  destination: string;
}

export interface CandidateFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface CandidateManifest {
  version: 1;
  project: string;
  source: CandidateSource;
  files: CandidateFile[];
  /** sha-256 over the sorted `path:sha256` lines of `files`. */
  digest: string;
}

export interface SearchEntry {
  path: string;
  title: string;
  description: string | null;
  plainText: string;
}

/** The compiled content as published; read back to compare against what is live. */
export interface CandidateContent {
  version: 1;
  project: UntrustedCompileResult["project"];
  folders: UntrustedCompileResult["folders"];
  assets: UntrustedCompileResult["assets"];
  pages: {
    path: string;
    title: string;
    description: string | null;
    order: number | null;
    section: string | null;
    headings: { id: string; title: string; depth: number }[];
    html: string;
    htmlSha256: string;
  }[];
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ChangeSummary {
  live: boolean;
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
  assetsAdded: string[];
  assetsRemoved: string[];
  assetsChanged: string[];
}

const sha256 = (data: string | Buffer): string =>
  crypto.createHash("sha256").update(data).digest("hex");

function writeFile(root: string, rel: string, data: string | Buffer): void {
  const target = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}

/** The digest of a list of files. Exported so the publisher computes it the same way. */
export function digestOf(files: readonly CandidateFile[]): string {
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}:${f.sha256}`);
  return sha256(lines.join("\n"));
}

/** Every file under `dir`, posix paths relative to it, sorted. */
function listFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), {
    withFileTypes: true,
  })) {
    const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(dir, child));
    else out.push(child);
  }
  return out.sort();
}

/**
 * Re-reads a candidate directory and checks it against its manifest: every
 * file of `content/` matches its hash, none is missing, none is extra, and the
 * digest is the recomputed one. Throws on any difference; returns the manifest.
 */
export function verifyCandidate(
  dir: string,
  expectedDigest?: string,
): CandidateManifest {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"),
  ) as CandidateManifest;
  if (manifest.version !== 1) throw new Error("unknown candidate version");
  const onDisk = listFiles(path.join(dir, "content"));
  const listed = manifest.files.map((f) => f.path).sort();
  if (JSON.stringify(onDisk) !== JSON.stringify(listed)) {
    throw new Error("the candidate's files don't match its manifest");
  }
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(dir, "content", file.path));
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) {
      throw new Error(`${file.path} doesn't match its manifest hash`);
    }
  }
  const digest = digestOf(manifest.files);
  if (digest !== manifest.digest) throw new Error("manifest digest is wrong");
  if (expectedDigest !== undefined && digest !== expectedDigest) {
    throw new Error(
      `the candidate's digest ${digest} isn't the one the build job reported (${expectedDigest})`,
    );
  }
  return manifest;
}

/** What changed between the live version's content and this candidate's. */
export function summarizeChanges(
  live: CandidateContent | null,
  next: CandidateContent,
): ChangeSummary {
  if (live === null) {
    return {
      live: false,
      added: next.pages.map((p) => p.path).sort(),
      removed: [],
      changed: [],
      unchanged: 0,
      assetsAdded: next.assets.map((a) => a.path).sort(),
      assetsRemoved: [],
      assetsChanged: [],
    };
  }
  const before = new Map(live.pages.map((p) => [p.path, p.htmlSha256]));
  const after = new Map(next.pages.map((p) => [p.path, p.htmlSha256]));
  const beforeAssets = new Map(live.assets.map((a) => [a.path, a.sha256]));
  const afterAssets = new Map(next.assets.map((a) => [a.path, a.sha256]));
  const added = [...after.keys()].filter((p) => !before.has(p)).sort();
  const removed = [...before.keys()].filter((p) => !after.has(p)).sort();
  const changed = [...after.keys()]
    .filter((p) => before.has(p) && before.get(p) !== after.get(p))
    .sort();
  return {
    live: true,
    added,
    removed,
    changed,
    unchanged: after.size - added.length - changed.length,
    assetsAdded: [...afterAssets.keys()]
      .filter((p) => !beforeAssets.has(p))
      .sort(),
    assetsRemoved: [...beforeAssets.keys()]
      .filter((p) => !afterAssets.has(p))
      .sort(),
    assetsChanged: [...afterAssets.keys()]
      .filter(
        (p) =>
          beforeAssets.has(p) && beforeAssets.get(p) !== afterAssets.get(p),
      )
      .sort(),
  };
}

function list(title: string, items: readonly string[]): string {
  if (items.length === 0) return "";
  const shown = items.slice(0, 50).map((i) => `- \`${i}\``);
  if (items.length > 50) shown.push(`- … and ${items.length - 50} more`);
  return `\n**${title} (${items.length})**\n\n${shown.join("\n")}\n`;
}

/** The markdown a reviewer reads in the run summary. */
export function renderSummary(
  manifest: CandidateManifest,
  changes: ChangeSummary,
  checks: readonly CheckResult[],
): string {
  const { source } = manifest;
  const lines = [
    `## Docs candidate: ${manifest.project}`,
    "",
    `- Source: \`${source.repository}\` @ \`${source.sha}\` (branch \`${source.branch}\`, \`${source.directory}\`)`,
    `- Destination: \`${source.destination}\``,
    `- Digest: \`${manifest.digest}\``,
    "",
    "### Checks",
    "",
    ...checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`),
    "",
    "### Changes against the live version",
    "",
    changes.live
      ? `${changes.added.length} added, ${changes.changed.length} changed, ${changes.removed.length} removed, ${changes.unchanged} unchanged.`
      : "No live version yet: this would be the first publication, so every page is new.",
    list("Pages added", changes.added),
    list("Pages changed", changes.changed),
    list("Pages removed", changes.removed),
    list("Assets added", changes.assetsAdded),
    list("Assets changed", changes.assetsChanged),
    list("Assets removed", changes.assetsRemoved),
  ];
  return lines.join("\n") + "\n";
}

const PREVIEW_CSP =
  "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The page's preview file, relative to `review/preview/`. */
function previewFileOf(project: string, pagePath: string): string {
  const rel = pagePath.slice(project.length + 1);
  return `${rel}.html`;
}

function relativeLink(from: string, to: string): string {
  const rel = path.posix.relative(path.posix.dirname(from), to);
  return rel === "" ? path.posix.basename(to) : rel;
}

/** A static, script-free rendering of the pages, links pointing at each other. */
function writePreview(
  reviewDir: string,
  project: string,
  content: CandidateContent,
): void {
  const files = new Map(
    content.pages.map((p) => [p.path, previewFileOf(project, p.path)]),
  );
  const home = `/docs/${project}`;
  const nav = (from: string): string =>
    content.pages
      .map(
        (p) =>
          `<li><a href="${escapeHtml(relativeLink(from, files.get(p.path)!))}">${escapeHtml(p.title)}</a></li>`,
      )
      .join("");

  for (const page of content.pages) {
    const file = files.get(page.path)!;
    const html = page.html.replace(
      /href="(\/docs\/[^"#]*)(#[^"]*)?"/g,
      (all, route: string, hash: string | undefined) => {
        const target =
          route === home ? `${project}/index` : route.slice("/docs/".length);
        const to = files.get(target);
        return to === undefined
          ? all
          : `href="${relativeLink(file, to)}${hash ?? ""}"`;
      },
    );
    writeFile(
      path.join(reviewDir, "preview"),
      file,
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">` +
        `<title>${escapeHtml(page.title)} (preview)</title>` +
        `<style>body{font:16px/1.5 system-ui;max-width:60rem;margin:2rem auto;padding:0 1rem}nav{border-bottom:1px solid #8884;margin-bottom:1rem}nav ul{display:flex;flex-wrap:wrap;gap:.75rem;list-style:none;padding:0}pre{overflow:auto}img,svg{max-width:100%}</style>` +
        `</head><body><nav aria-label="Pages"><ul>${nav(file)}</ul></nav><main>${html}</main></body></html>`,
    );
  }
}

export interface BuildCandidateOptions {
  docsDir: string;
  project: string;
  outDir: string;
  source: CandidateSource;
  /** The live version's `content.json`, when there is one. */
  live?: CandidateContent | null;
}

export interface BuildCandidateResult {
  manifest: CandidateManifest;
  changes: ChangeSummary;
  checks: CheckResult[];
}

/**
 * Compiles `docsDir` and writes the candidate to `outDir` (which must not
 * exist yet). Throws a `DocsBuildError` when the compiler refuses the docs;
 * nothing is written to `outDir` in that case beyond what already was.
 */
export async function buildCandidate(
  options: BuildCandidateOptions,
): Promise<BuildCandidateResult> {
  const { docsDir, project, outDir, source } = options;
  if (fs.existsSync(outDir)) {
    throw new Error(`${outDir} already exists; a candidate is written once`);
  }
  const compiled = await compileUntrustedDocs(docsDir, { project });

  const content: CandidateContent = {
    version: 1,
    project: compiled.project,
    folders: compiled.folders,
    assets: compiled.assets,
    pages: compiled.pages
      .map((p) => ({
        path: p.path,
        title: p.title,
        description: p.description,
        order: p.order,
        section: p.section,
        headings: p.headings,
        html: p.html,
        htmlSha256: sha256(p.html),
      }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  const search: SearchEntry[] = compiled.pages
    .map((p) => ({
      path: p.path,
      title: p.title,
      description: p.description,
      plainText: p.plainText,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  const staged = `${outDir}.partial`;
  fs.rmSync(staged, { recursive: true, force: true });
  const contentDir = path.join(staged, "content");
  const files: CandidateFile[] = [];
  const put = (rel: string, data: string | Buffer): void => {
    writeFile(contentDir, rel, data);
    files.push({
      path: rel,
      sha256: sha256(data),
      bytes: Buffer.byteLength(data),
    });
  };
  put("content.json", JSON.stringify(content));
  put("search.json", JSON.stringify(search));
  for (const asset of compiled.assets) {
    // Re-read from the source dir, then check against the hash the compiler took.
    const bytes = fs.readFileSync(path.join(docsDir, ...asset.path.split("/")));
    if (sha256(bytes) !== asset.sha256) {
      throw new Error(`${asset.path} changed while the candidate was built`);
    }
    put(`assets/${asset.path}`, bytes);
  }

  const manifest: CandidateManifest = {
    version: 1,
    project,
    source,
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
    digest: digestOf(files),
  };
  writeFile(staged, "manifest.json", JSON.stringify(manifest, null, 2) + "\n");

  // The checks are the readiness rules (readiness.ts), so a folder that passes
  // `devtools docs check` or the project page's readiness panel passes here.
  const contentProblems = pageContentProblems(
    project,
    compiled.pages.map((p) => ({
      path: p.path,
      title: p.title,
      plainText: p.plainText,
    })),
  );
  const overview = overviewProblem(
    content.pages.some((p) => p.path === `${project}/index`),
  );
  const brokenLinks = linkProblems(project, compiled.linkErrors);
  const checks: CheckResult[] = [
    {
      name: "compiles under the untrusted policy",
      ok: true,
      detail: `${content.pages.length} page(s), ${content.assets.length} asset(s)`,
    },
    {
      name: "every page has a title and text",
      ok: contentProblems.length === 0,
      detail:
        contentProblems.length === 0
          ? "title and searchable text present on all pages"
          : contentProblems.map((p) => p.file).join(", "),
    },
    {
      name: "has an overview page",
      ok: overview === null,
      detail: overview?.message ?? `${project}/index`,
    },
    {
      name: "internal links resolve",
      ok: brokenLinks.length === 0,
      detail:
        brokenLinks.length === 0
          ? "every link to another page resolves"
          : brokenLinks
              .slice(0, 10)
              .map((p) => `${p.file}: ${p.message}`)
              .join("; ") +
            (brokenLinks.length > 10
              ? `; and ${brokenLinks.length - 10} more`
              : ""),
    },
  ];
  const changes = summarizeChanges(options.live ?? null, content);

  const review = path.join(staged, "review");
  writeFile(review, "checks.json", JSON.stringify(checks, null, 2) + "\n");
  writeFile(review, "summary.md", renderSummary(manifest, changes, checks));
  writeFile(review, "changes.json", JSON.stringify(changes, null, 2) + "\n");
  writePreview(review, project, content);
  for (const asset of compiled.assets) {
    writeFile(
      path.join(review, "preview"),
      asset.path,
      fs.readFileSync(
        path.join(contentDir, "assets", ...asset.path.split("/")),
      ),
    );
  }

  fs.renameSync(staged, outDir);
  return { manifest, changes, checks };
}
