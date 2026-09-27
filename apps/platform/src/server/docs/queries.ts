import {
  pages,
  projects,
  type DocsPage,
  type DocsProject,
} from "@devdogsuga/docs";
import { projectPath, splitProjectPath } from "~/lib/docsSlug";
import {
  buildDocsSidebarSections,
  buildDocsTree,
  findFolder,
  type DocsSectionId,
  type DocsSidebarTree,
  type DocsTreeFolder,
  type DocsTreeNode,
} from "~/lib/docsTree";
import type { DocHeading } from "~/lib/toc";

// Docs are parsed from the repo's `docs/` folder at build time by
// @devdogsuga/docs, so every read here is an in-memory lookup over a bundled
// constant. No database, no cache, nothing to revalidate. `docs/` is grouped by
// project: each immediate subfolder is one project, and the first segment of a
// stored page path is its project.

export type { DocsProject };

const pagesByPath = new Map<string, DocsPage>(
  pages.map((page) => [page.path, page]),
);

/**
 * `DocsPage.section`, read defensively.
 *
 * TODO(docs-overhaul): drop this fallback once `@devdogsuga/docs-compiler`
 * ships `DocsPage.section` directly (contract item 1) — this repo's install
 * of `@devdogsuga/docs-compiler` predates that change (see the docs
 * contract), so `section` never actually appears on a real `DocsPage` yet.
 * Reads `frontmatter.section` in the meantime, which the compiler already
 * carries today, and falls back to the same default the contract specifies:
 * a page under `reference/` is `reference`, everything else is `guides`. The
 * project's own root index page is `null` regardless — see
 * `isProjectOverviewPath` in `~/lib/docsTree`, which this mirrors for the one
 * path shape that means "no section" rather than "the default section".
 */
function pageSection(page: DocsPage): DocsSectionId | null {
  const relPath = splitProjectPath(page.path).path;
  if (!relPath.includes("/") && /^(index|readme)$/i.test(relPath)) return null;

  const declared = (page as DocsPage & { section?: DocsSectionId | null })
    .section;
  if (declared) return declared;

  const frontmatterSection = page.frontmatter?.section;
  if (typeof frontmatterSection === "string") {
    return frontmatterSection as DocsSectionId;
  }

  return relPath === "reference" || relPath.startsWith("reference/")
    ? "reference"
    : "guides";
}

/** The projects shown on the docs landing page and the sidebar selector. */
export function getDocsProjects(): DocsProject[] {
  // TODO(docs-overhaul): drop this filter once `@devdogsuga/docs-compiler`
  // understands `docs/_shared/`'s `mount:` frontmatter (contract item 2) and
  // stops surfacing it as a project of its own. Until then the installed
  // compiler treats `_shared` exactly like `platform` or `toolkit` — an
  // immediate subfolder of `docs/` with pages in it — and this repo's own
  // contract is explicit that it is not one: "_shared is not itself a
  // project."
  return projects.filter((project) => project.slug !== "_shared");
}

/**
 * The sidebar tree for one project. Pages are returned with project-relative
 * paths, so the tree and the URLs it builds never carry the project prefix.
 */
export function getDocsTree(project: string): DocsTreeNode[] {
  return buildDocsTree(
    pages
      .filter((page) => page.project === project)
      .map((page) => ({
        path: splitProjectPath(page.path).path,
        title: page.title,
        order: page.order,
      })),
  );
}

/**
 * The sidebar's grouped view of one project: Overview, then the four fixed
 * sections, each dropped when empty. A separate call from `getDocsTree`
 * rather than a derived view of its result — see `buildDocsSidebarSections`
 * for why sectioning starts from the flat page list instead of partitioning
 * the folder tree.
 */
export function getDocsSidebarTree(project: string): DocsSidebarTree {
  return buildDocsSidebarSections(
    pages
      .filter((page) => page.project === project)
      .map((page) => ({
        path: splitProjectPath(page.path).path,
        title: page.title,
        order: page.order,
        section: pageSection(page),
      })),
  );
}

/** The folder at a project-relative path, or null if there is none. */
export function getDocsFolder(
  project: string,
  path: string,
): DocsTreeFolder | null {
  return findFolder(getDocsTree(project), path);
}

/** One entry in a folder's contents grid. */
export interface DocsFolderEntry {
  kind: "page" | "folder";
  /** Project-relative path: the page's own, or the subfolder's. */
  path: string;
  title: string;
  description: string | null;
}

/**
 * What a folder holds, in sidebar order. Descriptions come from the pages
 * themselves, because the tree stores only what the sidebar needs and a
 * one-line summary is not that.
 */
export function getDocsFolderEntries(
  project: string,
  folder: DocsTreeFolder,
): DocsFolderEntry[] {
  return folder.children.map((node) =>
    node.type === "folder"
      ? {
          kind: "folder" as const,
          path: node.path,
          title: node.name,
          description: null,
        }
      : {
          kind: "page" as const,
          path: node.path,
          title: node.title,
          description:
            pagesByPath.get(projectPath(project, node.path))?.description ??
            null,
        },
  );
}

export interface DocsPageContent {
  title: string;
  description: string | null;
  headings: DocHeading[];
  content: string;
  /**
   * `docs/_shared/<path>` for a page the compiler mounted into this project
   * from the shared pool (contract item 2), null for a page that lives here
   * natively. Drives the "edit this page" link: a mounted page's real source
   * is the shared file, not the per-project copy this route renders.
   *
   * TODO(docs-overhaul): `DocsPage.mountedFrom` doesn't exist on this
   * repo's installed `@devdogsuga/docs-compiler` yet — read defensively via a
   * type assertion until it ships, same as `pageSection` above.
   */
  mountedFrom: string | null;
}

export function getDocsPage(
  project: string,
  path: string,
): DocsPageContent | null {
  const page = pagesByPath.get(projectPath(project, path));
  if (!page) return null;

  return {
    title: page.title,
    description: page.description,
    headings: page.headings,
    content: page.content,
    mountedFrom:
      (page as DocsPage & { mountedFrom?: string | null }).mountedFrom ?? null,
  };
}
