/**
 * The compiler's rules, over a `ContentSource` rather than a directory.
 *
 * Reading the files (the file system in `compile.ts`, an in-memory tree in
 * `untrusted-policy.ts`) is the only thing that differs between the build, the
 * candidate pipeline and the platform's live preview, so everything that
 * decides what a page is lives here once: front matter, sections, folder
 * settings, mounts, ordering. Nothing in this file touches `node:fs`, Shiki or
 * the highlighter; the renderer is passed in.
 */
import { DocsBuildError } from "./errors.js";
import {
  headingsOf,
  parseBody,
  parseDocFile,
  plainTextOf,
  toTitleCase,
} from "./parse.js";
import { linkSourceOf, SHARED_DIR } from "./links.js";
import type { BodyRenderer } from "./render-pipeline.js";
import type { RenderPolicy } from "./sanitize.js";
import type {
  CompiledPage,
  DocsFolder,
  DocsPage,
  DocsProject,
  DocsSection,
  ParsedDocFile,
} from "./types.js";
import { DEFAULT_OS, VARIANT_GROUPS, type VariantContext } from "./variants.js";

/** Package machinery that sits alongside the content and is never a project. */
export const NOT_A_PROJECT = new Set(["dist", "node_modules"]);

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

/**
 * Front matter keys that used to do something. A page that still sets one
 * would publish at once, which for `scheduled` is the opposite of what its
 * author meant, so the build says so instead of ignoring it.
 */
function refuseRemovedKeys(
  frontmatter: Record<string, unknown>,
  file: string,
): void {
  if ("scheduled" in frontmatter) {
    throw new DocsBuildError(
      `${file}: "scheduled" is gone: pages are live once they merge. Remove it, or keep the page out of docs/ until it should be public`,
    );
  }
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

/**
 * One emitted copy's per-project fields. Headings and search text come from
 * the resolved body, because an `only{project=…}` block can add or remove a
 * heading, and a panel's text belongs in the index of every copy that ships
 * it.
 */
function emitCopy(
  parsed: ParsedDocFile,
  fields: Pick<CompiledPage, "project" | "path" | "section" | "mountedFrom">,
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
 * Where a content root's Markdown comes from. `projects()` is every immediate
 * subfolder that could be a project (hidden folders, `_shared` and package
 * machinery already left out), `pages(project)` its Markdown paths relative to
 * the project, extension stripped, and `shared()` the same for `_shared/`.
 * `read` takes a path below the content root with its `.md` extension.
 */
export interface ContentSource {
  projects(): string[];
  pages(project: string): string[];
  shared(): string[];
  read(file: string): string;
}

/**
 * A content root held in memory: the files' text by path below the root,
 * extension included (`workshops/index.md`, `_shared/guide.md`). Only `.md`
 * files and non-hidden names count, as on disk.
 */
export function memorySource(
  files: ReadonlyMap<string, string>,
): ContentSource {
  const visible = (rel: string): boolean =>
    rel.endsWith(".md") && !rel.split("/").some((part) => part.startsWith("."));
  const below = (prefix: string): string[] =>
    [...files.keys()]
      .filter((file) => file.startsWith(`${prefix}/`) && visible(file))
      .map((file) => file.slice(prefix.length + 1).replace(/\.md$/, ""));
  return {
    projects: () => [
      ...new Set(
        [...files.keys()]
          .filter((file) => file.includes("/") && visible(file))
          .map((file) => file.slice(0, file.indexOf("/")))
          .filter(
            (name) =>
              !name.startsWith(".") &&
              name !== SHARED_DIR &&
              !NOT_A_PROJECT.has(name),
          ),
      ),
    ],
    pages: (project) => below(project),
    shared: () => below(SHARED_DIR),
    read: (file) => {
      const text = files.get(file);
      if (text === undefined) throw new Error(`${file} is not in the content`);
      return text;
    },
  };
}

/**
 * Reads every markdown file in `source`, grouped by project. Each
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
export function compileContent(source: ContentSource): {
  projects: DocsProject[];
  pages: CompiledPage[];
  folders: DocsFolder[];
} {
  const projectSlugs = [...source.projects()].sort();

  const pages: CompiledPage[] = [];
  const projects: DocsProject[] = [];
  const folders: DocsFolder[] = [];
  /** Every emitted page's path, so a mount can be checked against it. */
  const occupied = new Map<string, string>();
  const projectOs = new Map<string, string[]>();

  for (const slug of projectSlugs) {
    const relPaths = [...source.pages(slug)].sort();
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
        source.read(`${slug}/${indexRel}.md`),
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
      const parsed = parseDocFile(source.read(file), rel.split("/").at(-1)!);
      refuseRemovedKeys(parsed.frontmatter, file);

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
          },
          { project: slug, projects: projectSlugs, os: project.os, file },
        ),
      );
      occupied.set(docsPath, file);
    }

    projects.push(project);
  }

  {
    for (const rel of [...source.shared()].sort()) {
      const file = `${SHARED_DIR}/${rel}.md`;
      const parsed = parseDocFile(source.read(file), rel.split("/").at(-1)!);
      refuseRemovedKeys(parsed.frontmatter, file);
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
 * Renders every compiled page's HTML with `render`, dropping what only the
 * build needed. Sequential: Shiki loads grammars lazily into one highlighter,
 * and a hundred pages racing to load the same grammar gain nothing over taking
 * turns.
 */
export async function renderPagesWith(
  render: BodyRenderer,
  compiled: readonly CompiledPage[],
  policyFor?: (page: CompiledPage) => RenderPolicy,
): Promise<DocsPage[]> {
  const pages: DocsPage[] = [];
  for (const { content, variants, ...page } of compiled) {
    pages.push({
      ...page,
      html: await render(
        content,
        variants,
        linkSourceOf(page),
        policyFor?.({ ...page, content, variants }),
      ),
    });
  }
  return pages;
}
