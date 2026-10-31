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
  type DocsSidebarPageInput,
  type DocsSidebarTree,
  type DocsTreeFolder,
  type DocsTreeNode,
} from "~/lib/docsTree";
import type { DocHeading } from "~/lib/toc";

// Docs are parsed from the repo's `docs/` folder at build time by
// @devdogsuga/docs, so every read here is an in-memory lookup over a bundled
// constant: no database. `docs/` is grouped by project: each immediate
// subfolder is one project, and the first segment of a stored page path is
// its project. Everything bundled is live: a page is public the day it merges.

export type { DocsProject };

const pagesByPath = new Map<string, DocsPage>(
  pages.map((page) => [page.path, page]),
);

/** A page's metadata, project-relative, without its HTML. */
interface DocsRow {
  path: string;
  title: string;
  description: string | null;
  order: number | null;
  section: DocsPage["section"];
}

function rowsOf(project: string): DocsRow[] {
  return pages
    .filter((page) => page.project === project)
    .map((page) => ({
      path: splitProjectPath(page.path).path,
      title: page.title,
      description: page.description,
      order: page.order,
      section: page.section,
    }));
}

function folderSettingsOf(project: string): DocsFolderSettings[] {
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

/** Every bundled docs project. */
export function getDocsProjects(): DocsProject[] {
  return projects;
}

function treeRows(project: string) {
  return rowsOf(project).map((row) => ({
    path: row.path,
    title: row.title,
    order: row.order,
  }));
}

/**
 * The sidebar tree for one project. Pages are returned with project-relative
 * paths, so the tree and the URLs it builds never carry the project prefix.
 */
export async function getDocsTree(project: string): Promise<DocsTreeNode[]> {
  return buildDocsTree(treeRows(project), folderSettingsOf(project));
}

/**
 * The sidebar's grouped view of one project: Overview, then the four fixed
 * sections, each dropped when empty. A separate call from `getDocsTree`
 * rather than a derived view of its result — see `buildDocsSidebarSections`
 * for why sectioning starts from the flat page list instead of partitioning
 * the folder tree.
 */
export async function getDocsSidebarTree(
  project: string,
): Promise<DocsSidebarTree> {
  const rows: DocsSidebarPageInput[] = rowsOf(project).map((row) => ({
    path: row.path,
    title: row.title,
    order: row.order,
    section: row.section,
  }));
  return buildDocsSidebarSections(rows, folderSettingsOf(project));
}

/** The folder at a project-relative path, or null if there is none. */
export async function getDocsFolder(
  project: string,
  path: string,
): Promise<DocsTreeFolder | null> {
  return findFolder(await getDocsTree(project), path);
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

/** Null for a page that does not exist. */
export async function getDocsPage(
  project: string,
  path: string,
): Promise<DocsPageContent | null> {
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
  steps: {
    path: string;
    title: string;
    /** The workshop step tag its page's `checkpoint:` frontmatter names. */
    checkpoint?: string;
  }[];
  /** This page's position in `steps`, from 0. */
  index: number;
}

/** Null unless the page sits directly in a `steps: true` folder. */
export async function getDocsStepNav(
  project: string,
  path: string,
): Promise<DocsStepNav | null> {
  const position = stepPositionOf(await getDocsTree(project), path);
  if (!position) return null;
  return {
    course: position.folder.name,
    steps: position.steps.map(({ path, title }) => {
      const checkpoint = pagesByPath.get(projectPath(project, path))
        ?.frontmatter?.checkpoint;
      return {
        path,
        title,
        ...(typeof checkpoint === "string" ? { checkpoint } : {}),
      };
    }),
    index: position.index,
  };
}

/** Every page's project-relative path, for the sitemap. */
export async function getDocsPagePaths(project: string): Promise<string[]> {
  return rowsOf(project).map((row) => row.path);
}
