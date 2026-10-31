/**
 * Whether a project's `docs/` folder is ready to publish: the answer the
 * project page shows its owners, `devtools docs check` prints, and the
 * candidate pipeline enforces.
 *
 * There is one set of rules, and this is it. The candidate build calls
 * `structureProblems` and `linkProblems` for its checks; `checkDocsReadiness`
 * runs the same two over a tree after the same untrusted compile
 * (`untrusted-policy.ts`), so a folder that passes here is a folder the
 * pipeline will accept, and one that fails is refused for the same reason in
 * the same words. The rules:
 *
 * - **structure**: names, file types, sizes, counts and nesting are the ones
 *   projects may use, there is an `index.md` (the overview page), and every
 *   page has a title and some text;
 * - **compile**: every page and image passes the untrusted compiler, which
 *   covers the front matter (only `name`, `description`, `order`, `section`,
 *   `steps` and `os`), the manifest, and everything it blocks: raw HTML off
 *   the allowlist, scripts, styles, classes, forms, external images, links out
 *   of the folder;
 * - **link**: every link to another page resolves.
 *
 * Nothing here reads a file system or loads Shiki. The caller chooses the
 * renderer: the plain one in a Worker, Shiki's in Node.
 */
import { DocsBuildError } from "./errors.js";
import type { LinkCheckError } from "./link-check.js";
import type { BodyRenderer } from "./render-pipeline.js";
import {
  analyzeUntrustedFiles,
  checkTreeEntries,
  type TreeEntry,
  type UntrustedFile,
  type UntrustedLimits,
} from "./untrusted-policy.js";

export type ReadinessKind = "structure" | "compile" | "link";

export interface ReadinessProblem {
  kind: ReadinessKind;
  /** The file (with a line, for markup) the problem is about; null for the folder as a whole. */
  file: string | null;
  message: string;
}

export interface Readiness {
  ready: boolean;
  problems: ReadinessProblem[];
  /** What was compiled; zero when the folder was refused before that. */
  pages: number;
  assets: number;
}

/** What `structureProblems` needs to know about a compiled page. */
export interface PageFacts {
  path: string;
  title: string;
  plainText: string;
}

/** The overview page every project has: `index.md` at the top of its docs folder. */
export const OVERVIEW_FILE = "index.md";

/** A page's path as the project's own docs folder names it: no project prefix. */
const within = (project: string, path: string): string =>
  path.startsWith(`${project}/`) ? path.slice(project.length + 1) : path;

/** Every page needs a title and some text to search. */
export function pageContentProblems(
  project: string,
  pages: readonly PageFacts[],
): ReadinessProblem[] {
  return pages
    .filter((p) => p.title.trim() === "" || p.plainText.trim() === "")
    .map((p) => ({
      kind: "structure" as const,
      file: `${within(project, p.path)}.md`,
      message: "has no title or no text",
    }));
}

/** A folder with no overview page has nothing for `/docs/<slug>` to open on. */
export function overviewProblem(hasOverview: boolean): ReadinessProblem | null {
  return hasOverview
    ? null
    : {
        kind: "structure",
        file: null,
        message: `has no overview page: add ${OVERVIEW_FILE} at the top of the docs folder`,
      };
}

/** Links to pages that don't exist. */
export function linkProblems(
  project: string,
  errors: readonly LinkCheckError[],
): ReadinessProblem[] {
  return errors.map((e) => {
    const file = within(project, e.file);
    return {
      kind: "link" as const,
      file: e.line === null ? file : `${file}:${e.line}`,
      message: e.message,
    };
  });
}

/** A project's docs folder: what is in it, and each regular file's bytes. */
export interface DocsTree {
  /**
   * Every entry, directories and links included, when the caller has them (a
   * GitHub tree does). Left out, each file is taken as a plain file.
   */
  entries?: readonly TreeEntry[];
  /** Regular files, by path relative to the docs folder. */
  files: ReadonlyMap<string, Uint8Array>;
}

export interface ReadinessOptions {
  /** The slug pages are compiled under; it only prefixes ids here. */
  project: string;
  render: BodyRenderer;
  limits?: Partial<UntrustedLimits>;
}

const asProblem = (message: string): ReadinessProblem => ({
  kind: "structure",
  file: null,
  message,
});

/** Runs the whole check over a tree. Never throws for what a project wrote. */
export async function checkDocsReadiness(
  tree: DocsTree,
  options: ReadinessOptions,
): Promise<Readiness> {
  const entries: readonly TreeEntry[] =
    tree.entries ??
    [...tree.files].map(([path, bytes]) => ({
      path,
      type: "file" as const,
      size: bytes.length,
    }));

  let kinds;
  try {
    kinds = checkTreeEntries(entries, options.limits);
  } catch (error) {
    if (!(error instanceof DocsBuildError)) throw error;
    return {
      ready: false,
      problems: [asProblem(error.message)],
      pages: 0,
      assets: 0,
    };
  }

  const files: UntrustedFile[] = [];
  for (const [rel, kind] of kinds) {
    const bytes = tree.files.get(rel);
    if (bytes === undefined) {
      return {
        ready: false,
        problems: [
          asProblem(`${rel}: was listed but its contents are missing`),
        ],
        pages: 0,
        assets: 0,
      };
    }
    files.push({ rel, kind, bytes });
  }

  const problems: ReadinessProblem[] = [];
  const noOverview = overviewProblem(kinds.get(OVERVIEW_FILE) === "page");
  if (noOverview) problems.push(noOverview);

  const { result, problems: refused } = await analyzeUntrustedFiles(
    files,
    {
      project: options.project,
      ...(options.limits ? { limits: options.limits } : {}),
    },
    options.render,
  );
  for (const p of refused) {
    problems.push({
      kind: "compile",
      file: p.file === "docs" ? null : p.file,
      message: p.message,
    });
  }
  if (result !== null) {
    problems.push(
      ...pageContentProblems(
        options.project,
        result.pages.map((p) => ({
          path: p.path,
          title: p.title,
          plainText: p.plainText,
        })),
      ),
      ...linkProblems(options.project, result.linkErrors),
    );
  }
  return {
    ready: problems.length === 0,
    problems,
    pages: result?.pages.length ?? 0,
    assets: result?.assets.length ?? 0,
  };
}
