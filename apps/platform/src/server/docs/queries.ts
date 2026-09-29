import {
  folders,
  pages,
  projects,
  variantGroups,
  type DocsPage,
  type DocsProject,
} from "@devdogsuga/docs";
import { projectPath, splitProjectPath } from "~/lib/docsSlug";
import {
  buildDocsSidebarSections,
  buildDocsTree,
  findFolder,
  stepPositionOf,
  type DocsFolderSettings,
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

/** One project's folder settings, with project-relative paths. */
function folderSettings(project: string): DocsFolderSettings[] {
  return folders
    .filter((folder) => folder.project === project)
    .map(({ path, name, order, steps }) => ({
      path: splitProjectPath(path).path,
      name,
      order,
      steps,
    }));
}

/** The setup axes pages vary by (platform, Supabase), with their labels. */
export function getDocsVariantGroups(): typeof variantGroups {
  return variantGroups;
}

/** The projects shown on the docs landing page and the sidebar selector. */
export function getDocsProjects(): DocsProject[] {
  return projects;
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
    folderSettings(project),
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
        section: page.section,
      })),
    folderSettings(project),
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
  /** Rendered at build time by the compiler, variants included. */
  html: string;
  /**
   * `docs/_shared/<path>` for a page the compiler mounted into this project
   * from the shared pool (contract item 2), null for a page that lives here
   * natively. Drives the "edit this page" link: a mounted page's real source
   * is the shared file, not the per-project copy this route renders.
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
    html: page.html,
    // The compiler's `mountedFrom` is relative to `_shared/`; this one is
    // relative to `docs/`, like every other path the edit link is built from.
    mountedFrom:
      page.mountedFrom === null ? null : `_shared/${page.mountedFrom}`,
  };
}

/** A step page's place in its course, for the pager under it. */
export interface DocsStepNav {
  /** The course's name: its folder's. */
  course: string;
  /** Every step, project-relative, in reading order. */
  steps: { path: string; title: string }[];
  /** This page's position in `steps`, from 0. */
  index: number;
}

/** Null unless the page sits directly in a `steps: true` folder. */
export function getDocsStepNav(
  project: string,
  path: string,
): DocsStepNav | null {
  const position = stepPositionOf(getDocsTree(project), path);
  if (!position) return null;
  return {
    course: position.folder.name,
    steps: position.steps.map(({ path, title }) => ({ path, title })),
    index: position.index,
  };
}
