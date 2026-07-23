/** The docs sidebar tree, folded from the flat (path, title) page rows. */

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
  children: DocsTreeNode[];
}

export type DocsTreeNode = DocsTreePage | DocsTreeFolder;

function toTitleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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

/** Depth-first first page — the landing target for a repo or branch root. */
export function firstPagePath(nodes: DocsTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "page") return node.path;
    const nested = firstPagePath(node.children);
    if (nested) return nested;
  }
  return null;
}

export function treeContainsPath(nodes: DocsTreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.type === "page" && node.path === path) return true;
    if (node.type === "folder" && treeContainsPath(node.children, path))
      return true;
  }
  return false;
}
