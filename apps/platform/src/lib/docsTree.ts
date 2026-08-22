/** The docs sidebar tree, folded from the flat (path, title) page rows. */
import { toTitleCase } from "./toTitleCase";

export interface DocsTreePage {
  type: "page";
  /** Slash-joined slug below docs/, e.g. "guides/setup". */
  path: string;
  title: string;
}

export interface DocsTreeFolder {
  type: "folder";
  name: string;
  /** The path segment this folder occupies. */
  segment: string;
  /**
   * Slash-joined project-relative path to this folder, e.g.
   * "guides/deployment" — the same shape a page's `path` has, and what the
   * folder's own URL is built from.
   */
  path: string;
  children: DocsTreeNode[];
}

export type DocsTreeNode = DocsTreePage | DocsTreeFolder;

function isIndexPage(node: DocsTreeNode): boolean {
  if (node.type !== "page") return false;
  const name = node.path.split("/").at(-1)!.toLowerCase();
  return name === "index" || name === "readme";
}

function sortNodes(nodes: DocsTreeNode[]): DocsTreeNode[] {
  return nodes.sort((a, b) => {
    const aIndex = isIndexPage(a) ? 0 : 1;
    const bIndex = isIndexPage(b) ? 0 : 1;
    if (aIndex !== bIndex) return aIndex - bIndex;
    const aName = a.type === "page" ? a.title : a.name;
    const bName = b.type === "page" ? b.title : b.name;
    return aName.localeCompare(bName);
  });
}

export function buildDocsTree(
  pages: { path: string; title: string }[],
): DocsTreeNode[] {
  const root: DocsTreeNode[] = [];
  const folders = new Map<string, DocsTreeFolder>();

  function folderFor(segments: string[]): DocsTreeNode[] {
    if (segments.length === 0) return root;
    const key = segments.join("/");
    let folder = folders.get(key);
    if (!folder) {
      folder = {
        type: "folder",
        name: toTitleCase(segments.at(-1)!),
        segment: segments.at(-1)!,
        path: key,
        children: [],
      };
      folders.set(key, folder);
      folderFor(segments.slice(0, -1)).push(folder);
    }
    return folder.children;
  }

  for (const page of pages) {
    const segments = page.path.split("/");
    folderFor(segments.slice(0, -1)).push({
      type: "page",
      path: page.path,
      title: page.title,
    });
  }

  for (const folder of folders.values()) sortNodes(folder.children);
  return sortNodes(root);
}

/** The folder at a project-relative path, or null if no such folder exists. */
export function findFolder(
  nodes: DocsTreeNode[],
  path: string,
): DocsTreeFolder | null {
  if (!path) return null;

  let level = nodes;
  let found: DocsTreeFolder | null = null;

  for (const segment of path.split("/")) {
    const next = level.find(
      (node): node is DocsTreeFolder =>
        node.type === "folder" && node.segment === segment,
    );
    if (!next) return null;
    found = next;
    level = next.children;
  }

  return found;
}

/**
 * The index page sitting directly inside a folder, if it has one — the page a
 * reader should land on when they select the folder itself. A folder without
 * one has nothing to show but its contents, which is what the folder route
 * renders as a grid.
 */
export function indexPageOf(folder: DocsTreeFolder): DocsTreePage | null {
  return (
    folder.children.find(
      (node): node is DocsTreePage => node.type === "page" && isIndexPage(node),
    ) ?? null
  );
}

/** Every folder in the tree, at any depth — one per prerendered folder route. */
export function allFolders(nodes: DocsTreeNode[]): DocsTreeFolder[] {
  return nodes.flatMap((node) =>
    node.type === "folder" ? [node, ...allFolders(node.children)] : [],
  );
}

/** Depth-first first page — the landing target for a repo or branch root. */
export function firstPagePath(nodes: DocsTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "page") return node.path;
    const nested = firstPagePath(node.children);
    if (nested) return nested;
  }
  return null;
}
