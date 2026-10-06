import * as fs from "node:fs";
import * as path from "node:path";
import { DocsBuildError } from "./errors.js";
import {
  headingsOf,
  parseBody,
  parseDocFile,
  plainTextOf,
  toTitleCase,
} from "./parse.js";
import { linkSourceOf } from "./links.js";
import { renderBody } from "./render.js";
import type {
  CompiledPage,
  DocsFolder,
  DocsPage,
  DocsProject,
  DocsSection,
  ParsedDocFile,
} from "./types.js";
import { DEFAULT_OS, VARIANT_GROUPS, type VariantContext } from "./variants.js";
import { writeIfChanged } from "./write.js";

/** Package machinery that sits alongside the content and is never a project. */
const NOT_A_PROJECT = new Set(["dist", "node_modules"]);

/**
 * `docs/_shared/**`: pages that are not a project of their own, only content
 * mounted into others. See `compileDocs`'s header.
 */
const SHARED_DIR = "_shared";

const VALID_SECTIONS = new Set<DocsSection>([
  "getting-started",
  "guides",
  "infrastructure",
  "reference",
]);

/** Any `reference/` segment, at any depth, is where `gen` writes. */
function isUnderReference(rel: string): boolean {
  return rel.split("/").includes("reference");
}

/**
 * A page's `section`, from its own frontmatter or the default rule.
 *
 * A project's own `index.md` — the Overview — takes none: it is not one of
 * the four sidebar blocks, it sits above them, so declaring a `section` on it
 * is a contradiction rather than an instruction, and this refuses it rather
 * than silently discarding it.
 *
 * Everywhere else, explicit frontmatter wins and has to name one of the four
 * blocks; naming anything else is a typo a build should catch, not a page
 * that quietly sorts into "guides". Absent frontmatter falls back to the one
 * mechanical rule the contract gives: a generated reference page lives under
 * a `reference/` segment and sorts there, everything else defaults to
 * "guides".
 */
function deriveSection(
  frontmatter: Record<string, unknown>,
  rel: string,
  isProjectIndex: boolean,
  file: string,
): DocsSection | null {
  const raw = frontmatter["section"];

  if (isProjectIndex) {
    if (raw !== undefined) {
      throw new DocsBuildError(
        `${file}: a project's index.md is the Overview and takes no "section" (found ${JSON.stringify(raw)}) — remove it`,
      );
    }
    return null;
  }

  if (raw === undefined) {
    return isUnderReference(rel) ? "reference" : "guides";
  }

  if (typeof raw !== "string" || !VALID_SECTIONS.has(raw as DocsSection)) {
    throw new DocsBuildError(
      `${file}: invalid "section: ${JSON.stringify(raw)}" — must be one of ${[...VALID_SECTIONS].join(", ")}`,
    );
  }

  return raw as DocsSection;
}

/**
 * Where something that declares no `order` sits. The middle of the range, so a
 * page can be promoted above the pages that never think about ordering as well
 * as demoted below them. The generator uses both directions, giving the routes
 * and server-actions overviews single digits and the symbol groups 100 and up.
 * `apps/platform`'s sidebar builder carries the same number for the same
 * reason; it takes plain rows rather than this package's types, so keeping the
 * two in step is manual.
 */
const DEFAULT_ORDER = 100;

/** Markdown paths below `dir`, relative to it, extension stripped, slash-separated. */
function walk(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...walk(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      found.push(rel.replace(/\.md$/, ""));
    }
  }
  return found;
}

function isIndexPath(pagePath: string): boolean {
  const base = pagePath.split("/").at(-1)?.toLowerCase() ?? "";
  return base === "index" || base === "readme";
}

/** A project index's `os:` list, validated; `DEFAULT_OS` when absent. */
function readProjectOs(
  frontmatter: Record<string, unknown>,
  file: string,
): string[] {
  const raw = frontmatter["os"];
  if (raw === undefined) return [...DEFAULT_OS];
  const known = VARIANT_GROUPS.os.values;
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    !raw.every((value) => typeof value === "string" && known.includes(value))
  ) {
    throw new DocsBuildError(
      `${file}: "os" must be a non-empty list drawn from ${known.join(", ")}`,
    );
  }
  // Canonical order, so the switcher and every tab strip agree.
  return known.filter((value) => raw.includes(value));
}

/**
 * Whether a file is a folder's settings rather than a page: an `index.md`
 * below a project's top level with frontmatter and nothing else. A folder
 * index with a body is still the page the folder opens on, and a project's own
 * `index.md` is always its Overview page, body or not.
 */
function isFolderSettings(rel: string, parsed: ParsedDocFile): boolean {
  return rel.includes("/") && isIndexPath(rel) && parsed.content.trim() === "";
}

/** `steps:`, validated: a boolean, or absent for false. */
function readSteps(
  frontmatter: Record<string, unknown>,
  file: string,
): boolean {
  const raw = frontmatter["steps"];
  if (raw === undefined) return false;
  if (typeof raw !== "boolean") {
    throw new DocsBuildError(
      `${file}: "steps" must be true or false (found ${JSON.stringify(raw)})`,
    );
  }
  return raw;
}

const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `scheduled:`, validated and normalised to a UTC ISO string; null when
 * absent. A string has to carry a timezone: "6pm" on a club server means
 * nothing, and a reveal an hour off is worse than a build that asks. YAML
 * already turns an unquoted timestamp into a `Date`, which is unambiguous.
 */
function readScheduled(
  frontmatter: Record<string, unknown>,
  file: string,
): string | null {
  const raw = frontmatter["scheduled"];
  if (raw === undefined) return null;
  let date: Date | null = null;
  if (raw instanceof Date) {
    date = raw;
  } else if (typeof raw === "string" && ISO_WITH_ZONE.test(raw)) {
    date = new Date(raw);
  }
  if (date === null || Number.isNaN(date.getTime())) {
    throw new DocsBuildError(
      `${file}: invalid "scheduled: ${JSON.stringify(raw)}" — use an ISO time with a timezone, like 2026-10-05T18:00:00-04:00`,
    );
  }
  return date.toISOString();
}

/** Every directory above a path, nearest first: "a/b/c" gives "a/b", "a". */
function ancestorDirs(dirPath: string): string[] {
  const parts = dirPath.split("/");
  const found: string[] = [];
  for (let i = parts.length - 1; i >= 1; i--) {
    found.push(parts.slice(0, i).join("/"));
  }
  return found;
}

/**
 * Resolves every folder's and page's `publishAt` against the folders above it.
 * A scheduled folder hides everything inside it, so a nested folder or page
 * either inherits that time or sets a later one; setting an earlier one is a
 * contradiction (it would look revealed while its folder is hidden) and fails
 * the build. Folders are resolved shallowest first, so the nearest scheduled
 * ancestor already carries the latest time along its chain.
 */
function applySchedules(pages: CompiledPage[], folders: DocsFolder[]): void {
  const inherited = (
    childPath: string,
  ): { at: string; from: string } | null => {
    for (const dir of ancestorDirs(childPath)) {
      const folder = folders.find((f) => f.path === dir);
      if (folder?.publishAt) return { at: folder.publishAt, from: dir };
    }
    return null;
  };

  const check = (
    own: string | null,
    childPath: string,
    file: string,
  ): string | null => {
    const above = inherited(childPath);
    if (own === null) return above?.at ?? null;
    if (above !== null && own < above.at) {
      throw new DocsBuildError(
        `${file}: "scheduled" (${own}) is earlier than its folder ${above.from} (${above.at}) — a page can only be scheduled later than its folder`,
      );
    }
    return own;
  };

  for (const folder of [...folders].sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length,
  )) {
    folder.publishAt = check(
      folder.publishAt,
      folder.path,
      `${folder.path}/index.md`,
    );
  }
  for (const page of pages) {
    page.publishAt = check(page.publishAt, page.path, `${page.path}.md`);
  }
}

/**
 * One emitted copy's per-project fields. Headings and search text come from
 * the resolved body, because an `only{project=…}` block can add or remove a
 * heading, and a panel's text belongs in the index of every copy that ships
 * it.
 */
function emitCopy(
  parsed: ParsedDocFile,
  fields: Pick<
    CompiledPage,
    "project" | "path" | "section" | "mountedFrom" | "publishAt"
  >,
  variants: VariantContext,
): CompiledPage {
  const tree = parseBody(parsed.content, variants);
  return {
    ...parsed,
    ...fields,
    headings: headingsOf(tree),
    plainText: plainTextOf(tree),
    variants,
  };
}

/** `frontmatter.mount`, validated. Throws rather than warns: an author who */
function readMountTargets(
  frontmatter: Record<string, unknown>,
  knownProjects: readonly string[],
  file: string,
): string[] {
  const raw = frontmatter["mount"];
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    !raw.every((value) => typeof value === "string")
  ) {
    throw new DocsBuildError(
      `${file}: "mount" must be a non-empty array of project slugs`,
    );
  }

  const targets = raw;
  const seen = new Set<string>();

  for (const project of targets) {
    if (seen.has(project)) {
      throw new DocsBuildError(`${file}: mounts "${project}" more than once`);
    }
    seen.add(project);

    if (!knownProjects.includes(project)) {
      throw new DocsBuildError(
        `${file}: mounts into unknown project "${project}" — known projects are ${knownProjects.join(", ")}`,
      );
    }
  }

  return targets;
}

/**
 * Reads every markdown file under `contentRoot`, grouped by project. Each
 * immediate subfolder is one project, and the first segment of a page's path is
 * its project — except `_shared`, which is never a project of its own.
 *
 * A page under `docs/_shared/<path>.md` declaring `mount: [<project>, ...]` is
 * emitted as a copy into every listed project, at `<project>/<path>` (so it
 * renders at `/docs/<project>/<path>`), with `mountedFrom` set to
 * `_shared/<path>` for the emitted copy's "edit this page" link. A page that
 * is partly app-specific is expected to split into a shared page plus a
 * separate page under the app that needs more; this function only mounts
 * what it is told to.
 *
 * Two things fail the build rather than warn, because a wrong copy silently
 * shipped is worse than a build a contributor has to fix: mounting into a
 * project this content root does not have, and a mount whose target path is
 * already a real page.
 */
export function compileDocs(contentRoot: string): {
  projects: DocsProject[];
  pages: CompiledPage[];
  folders: DocsFolder[];
} {
  const projectSlugs = fs
    .readdirSync(contentRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== SHARED_DIR &&
        !NOT_A_PROJECT.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

  const pages: CompiledPage[] = [];
  const projects: DocsProject[] = [];
  const folders: DocsFolder[] = [];
  /** Every emitted page's path, so a mount can be checked against it. */
  const occupied = new Map<string, string>();
  const projectOs = new Map<string, string[]>();

  for (const slug of projectSlugs) {
    const projectDir = path.join(contentRoot, slug);
    const relPaths = walk(projectDir).sort();
    if (relPaths.length === 0) continue;

    const project: DocsProject = {
      slug,
      name: toTitleCase(slug),
      description: null,
      order: null,
      os: [...DEFAULT_OS],
    };

    // The project's own index seeds its display name, description, position
    // on the docs landing page and platforms. Read first, because every page
    // below needs the platforms to resolve its `os` tabs. A nested folder's
    // index page does not count; that one positions its own folder in the
    // sidebar, which is `buildDocsTree`'s business rather than this loop's.
    const indexRel = relPaths.find(
      (rel) => isIndexPath(rel) && !rel.includes("/"),
    );
    if (indexRel !== undefined) {
      const { frontmatter, description, order } = parseDocFile(
        fs.readFileSync(path.join(projectDir, `${indexRel}.md`), "utf-8"),
        indexRel,
      );
      if (typeof frontmatter["name"] === "string") {
        project.name = frontmatter["name"];
      }
      project.description = description;
      project.order = order;
      project.os = readProjectOs(frontmatter, `${slug}/${indexRel}.md`);
    }
    projectOs.set(slug, project.os);

    for (const rel of relPaths) {
      const file = `${slug}/${rel}.md`;
      const source = fs.readFileSync(
        path.join(projectDir, `${rel}.md`),
        "utf-8",
      );
      const parsed = parseDocFile(source, rel.split("/").at(-1)!);

      const isProjectIndex = isIndexPath(rel) && !rel.includes("/");
      const steps = readSteps(parsed.frontmatter, file);

      if (isFolderSettings(rel, parsed)) {
        const dir = rel.split("/").slice(0, -1);
        const name = parsed.frontmatter["name"];
        folders.push({
          project: slug,
          path: [slug, ...dir].join("/"),
          name: typeof name === "string" ? name : toTitleCase(dir.at(-1)!),
          description: parsed.description,
          order: parsed.order,
          steps,
          publishAt: readScheduled(parsed.frontmatter, file),
        });
        continue;
      }
      if (steps) {
        throw new DocsBuildError(
          `${file}: "steps" belongs on a folder's settings (an index.md with frontmatter and no body), not on a page`,
        );
      }
      const section = deriveSection(
        parsed.frontmatter,
        rel,
        isProjectIndex,
        file,
      );

      const docsPath = `${slug}/${rel}`;
      pages.push(
        emitCopy(
          parsed,
          {
            project: slug,
            path: docsPath,
            section,
            mountedFrom: null,
            publishAt: readScheduled(parsed.frontmatter, file),
          },
          { project: slug, projects: projectSlugs, os: project.os, file },
        ),
      );
      occupied.set(docsPath, file);
    }

    projects.push(project);
  }

  const sharedDir = path.join(contentRoot, SHARED_DIR);
  if (fs.statSync(sharedDir, { throwIfNoEntry: false })?.isDirectory()) {
    for (const rel of walk(sharedDir).sort()) {
      const file = `${SHARED_DIR}/${rel}.md`;
      const source = fs.readFileSync(
        path.join(sharedDir, `${rel}.md`),
        "utf-8",
      );
      const parsed = parseDocFile(source, rel.split("/").at(-1)!);
      const targets = readMountTargets(parsed.frontmatter, projectSlugs, file);

      for (const project of targets) {
        const docsPath = `${project}/${rel}`;
        const collision = occupied.get(docsPath);
        if (collision !== undefined) {
          throw new DocsBuildError(
            `${file}: mounting into "${project}" collides with "${collision}" at ${docsPath}`,
          );
        }

        const section = deriveSection(parsed.frontmatter, rel, false, file);
        pages.push(
          emitCopy(
            parsed,
            {
              project,
              path: docsPath,
              section,
              mountedFrom: rel,
              publishAt: readScheduled(parsed.frontmatter, file),
            },
            {
              project,
              projects: projectSlugs,
              os: projectOs.get(project) ?? [...DEFAULT_OS],
              file,
            },
          ),
        );
        occupied.set(docsPath, file);
      }
    }
  }

  applySchedules(pages, folders);

  projects.sort(
    (a, b) =>
      (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) ||
      a.name.localeCompare(b.name),
  );

  // Pages stay in path order, which `order` has no business disturbing: this
  // array is the lookup table every consumer indexes by path, and a page's
  // `order` positions it among its siblings in one folder. That meaning only
  // survives inside the sidebar tree, where the siblings are what it is
  // compared against. Sorting the flat list by it would interleave folders and
  // produce a sequence that is not the reading order of anything.
  pages.sort((a, b) => a.path.localeCompare(b.path));
  folders.sort((a, b) => a.path.localeCompare(b.path));

  return { projects, pages, folders };
}

/**
 * Renders every compiled page's HTML, dropping what only the build needed.
 * Sequential: Shiki loads grammars lazily into one highlighter, and a hundred
 * pages racing to load the same grammar gain nothing over taking turns.
 */
export async function renderPages(
  compiled: readonly CompiledPage[],
): Promise<DocsPage[]> {
  const pages: DocsPage[] = [];
  for (const { content, variants, ...page } of compiled) {
    pages.push({
      ...page,
      html: await renderBody(content, variants, linkSourceOf(page)),
    });
  }
  return pages;
}

/**
 * Writes the compiled content as an ESM module plus its declarations.
 *
 * The output is written directly rather than run through tsc, so the content
 * package needs no TypeScript toolchain: `docs/` stays markdown plus a
 * package.json, with none of this code sitting alongside it.
 */
export async function emitDocsModule(
  contentRoot: string,
  outDir: string,
): Promise<number> {
  const { projects, pages: compiled, folders } = compileDocs(contentRoot);
  const pages = await renderPages(compiled);

  writeIfChanged(
    path.join(outDir, "index.js"),
    `// GENERATED by @devdogsuga/docs-kit — do not edit.
export const projects = ${JSON.stringify(projects, null, 2)};

export const variantGroups = ${JSON.stringify(VARIANT_GROUPS, null, 2)};

export const pages = ${JSON.stringify(pages, null, 2)};

export const folders = ${JSON.stringify(folders, null, 2)};
`,
  );

  writeIfChanged(
    path.join(outDir, "index.d.ts"),
    `// GENERATED by @devdogsuga/docs-kit — do not edit.
import type {
  DocsFolder,
  DocsPage,
  DocsProject,
  VARIANT_GROUPS,
} from "@devdogsuga/docs-kit";

export declare const projects: DocsProject[];
/** The setup axes a page can vary by, their values and labels. */
export declare const variantGroups: typeof VARIANT_GROUPS;
export declare const pages: DocsPage[];
/** Folder settings: the name, order and steps of folders that declare them. */
export declare const folders: DocsFolder[];

export type {
  DocHeading,
  DocsFolder,
  DocsPage,
  DocsProject,
  DocsSection,
  ParsedDocFile,
  VariantGroup,
} from "@devdogsuga/docs-kit";
`,
  );

  return pages.length;
}
