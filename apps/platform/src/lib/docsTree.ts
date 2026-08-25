/** The docs sidebar tree, folded from the flat (path, title, order) page rows. */
import { toTitleCase } from "./toTitleCase";

export interface DocsTreePage {
  type: "page";
  /** Slash-joined slug below docs/, e.g. "guides/setup". */
  path: string;
  title: string;
  /** The page's `order:` frontmatter, or null when it declares none. */
  order: number | null;
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
  /** Derived, not declared — see `folderOrder`. Null means the default. */
  order: number | null;
  children: DocsTreeNode[];
}

export type DocsTreeNode = DocsTreePage | DocsTreeFolder;

/**
 * Where a page or folder that declares no `order` sits. The same number
 * `@devdogsuga/docs-build`'s compiler defaults projects to, and deliberately
 * mid-range: a page can be promoted above the pages that never think about
 * ordering as well as demoted below them. This module is handed plain rows
 * rather than that package's types — it has no dependency on it — so the
 * constant lives in both places.
 */
const DEFAULT_ORDER = 100;

/**
 * Whether a node is the page its folder itself resolves to.
 *
 * Exported because the sidebar relabels exactly these rows — see
 * `DOCS_INDEX_LABEL` — and a second definition of "is this the index" would be
 * free to disagree with the one that decides sort order right below.
 */
export function isIndexPage(node: DocsTreeNode): boolean {
  if (node.type !== "page") return false;
  const name = node.path.split("/").at(-1)!.toLowerCase();
  return name === "index" || name === "readme";
}

/** A node's position among its siblings, with the default filled in. */
function effectiveOrder(node: DocsTreeNode): number {
  return node.order ?? DEFAULT_ORDER;
}

/**
 * Where a folder sits among ITS siblings, which is a different question from
 * the one its children's numbers answer: `order` is a position within one
 * folder, so a folder that says nothing about itself has nothing to inherit
 * that still means the same thing a level up. The cascade is its own index
 * page, then — below the top level only — the smallest number anything inside
 * it declares, then nothing.
 *
 * The index page wins when it has a number because it is the one place an
 * author can say where a section goes and be understood — `guides/index.md`
 * with `order: 5` is a statement about `guides/`, not about anything beside
 * it. Worth knowing that branch has a second, accidental source: the generator
 * writes `reference/components/index.md` with the slot that group took among
 * the COMPONENT groups rather than with an opinion about where `components/`
 * belongs among `reference/`'s children — `order: 118` in platform is the 19th
 * of that project's component groups, `order: 103` in schedule-builder is the
 * 4th of its ten. Both land the folder in the same gap the fallback would
 * (after `api-routes` at 3, before the symbol pages at 200), so nothing is
 * wrong today, but the number will drift as component groups are added and
 * renamed.
 *
 * The fallback takes the SMALLEST declared number, because a section starts
 * where its earliest content starts. The generator numbers a folder's pages as
 * a run following the page that names it — `reference/server.md` is 203 and
 * `reference/server/*` runs 204 to 222 — and the smallest puts `Server/`
 * immediately after `server`, which is the row a reader is looking under. The
 * largest would land it in the same gap here, but it breaks where a folder's
 * children are not one run: `toolkit/reference/api/` holds seven package pages
 * that all carry `order: 200`, because each package is a separate generator
 * target restarting the sequence, and its subfolders restart too. Taking the
 * largest sorted those subfolders by how many pages they happen to hold —
 * `Devtools/` last because it has nine, `Docs Build/` first because it has one
 * — which is not an order anyone can read.
 *
 * An unnumbered child counts at the default, the same 100 `effectiveOrder`
 * hands it when this folder's own children are sorted. Reading only the
 * numbers somebody actually wrote would let a folder claim to start where no
 * row inside it sits: a folder holding an unnumbered page and a page at
 * `order: 300` would answer 300, while the row a reader meets on opening it is
 * the unnumbered one, sorted at 100. It would also read that 300 backwards,
 * because it says where that page goes INSIDE the folder — last. The folder
 * would answer null before the number was written and 300 after, so sending
 * one page to the back of a section would drag the section itself back with
 * it. Filling the default in can never cost a folder an early slot, because
 * `Math.min` keeps the smaller of the two: a folder whose only declared number
 * is 1 still answers 1.
 *
 * A folder with nothing declared anywhere inside is the single case that stays
 * null instead of answering 100, because null is what `DocsTreeFolder.order`
 * means by "no opinion, take the default", and a folder of pages with no
 * opinion has none of its own to report. Both readings draw it in the same
 * place — `effectiveOrder` turns null back into 100 — so the distinction is in
 * what the field says, not where the folder lands.
 *
 * None of which decides anything in `docs/` as it stands today, and the
 * comment would rather admit that than imply a load-bearing rule. This
 * fallback runs only below the top level; every folder below the top level in
 * the corpus is generated under some project's `reference/`; and every
 * generated page carries an `order`. So no folder that reaches here holds an
 * unnumbered child at all, and the two readings agree on every folder in every
 * project. The pages that declare no order are all hand-written, and they sit
 * either at a project's top level or inside `platform/documentation-system/`,
 * which is itself depth 0 and has already returned null above. The rule is
 * written for the hand-written folder somebody nests tomorrow.
 *
 * And the derivation stops at the top level, which is `depth`'s only job here.
 * A depth-0 folder is not a row among the pages: `Nodes` in
 * `components/DocsSidebar/Tree.tsx` renders depth-0 nodes as
 * `[...pages, ...folders]`, so it is drawn as a section heading below every
 * loose page whatever number it carries — `Reference/` is last in the platform
 * sidebar because of that partition and was last before this module read
 * `order` at all. All a derived number could still change up there is which
 * section heading precedes which, and the numbers inside `reference/` are no
 * basis for that: `server-actions.md`'s `order: 1` means "first among
 * reference/'s own pages", and propagating it would put generated reference
 * above the hand-written Documentation System guides on the strength of a
 * claim that was never about them. So sections sort by title unless somebody
 * writes an order on the section's own `index.md`, which is the way to say it
 * on purpose. Below the top level the propagation is safe because both ends of
 * it come from the same generator run over the same project.
 */
function folderOrder(folder: DocsTreeFolder, depth: number): number | null {
  const index = indexPageOf(folder);
  if (index?.order != null) return index.order;
  if (depth === 0) return null;

  // This also stands in for a length guard, though nothing needs one:
  // `folderFor` only ever creates a folder at the moment something is pushed
  // into it, so a folder in a built tree always holds at least one node — and
  // an empty one would leave through here as null rather than reach `Math.min`
  // with nothing, since `every` on an empty array is true.
  if (folder.children.every((child) => child.order === null)) return null;

  return Math.min(...folder.children.map(effectiveOrder));
}

function sortNodes(nodes: DocsTreeNode[]): DocsTreeNode[] {
  return nodes.sort((a, b) => {
    // An index page leads its folder whatever its `order` says, because that
    // number is about the folder's placement rather than its own: it is the
    // page the folder itself resolves to, so nothing else can precede it.
    const aIndex = isIndexPage(a) ? 0 : 1;
    const bIndex = isIndexPage(b) ? 0 : 1;
    if (aIndex !== bIndex) return aIndex - bIndex;
    const byOrder = effectiveOrder(a) - effectiveOrder(b);
    if (byOrder !== 0) return byOrder;
    const aName = a.type === "page" ? a.title : a.name;
    const bName = b.type === "page" ? b.title : b.name;
    return aName.localeCompare(bName);
  });
}

/**
 * Sorts every level, deepest first. A folder with no number of its own takes
 * one from what it holds, and a nested folder's number is derived the same way
 * from what IT holds, so a whole subtree has to be resolved before the level
 * above it can be sorted — a parent asking `folderOrder` a question it cannot
 * answer yet would read a nested folder's `order` while it was still the null
 * `folderFor` seeded it with.
 */
function sortTree(nodes: DocsTreeNode[], depth: number): DocsTreeNode[] {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    sortTree(node.children, depth + 1);
    node.order = folderOrder(node, depth);
  }
  return sortNodes(nodes);
}

export function buildDocsTree(
  pages: { path: string; title: string; order: number | null }[],
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
        order: null,
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
      order: page.order,
    });
  }

  return sortTree(root, 0);
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

/**
 * Depth-first first page — where `/docs/<project>` redirects to. It walks the
 * array as `buildDocsTree` left it rather than as the sidebar draws it, and
 * the two really do disagree at the top level: the sidebar's own partition
 * gathers folders below the pages, while the array leaves them interleaved by
 * title, so `docs/platform` sorts `Documentation System/` between `Database &
 * Migrations` and `Elections`. What keeps this from descending into a section
 * there is the project's own `index.md`, which leads its folder whatever else
 * is around it.
 *
 * Where a project has no root index page, `order` is what moves this target.
 * `/docs/toolkit` lands on `reference/components/index` rather than on the
 * alphabetically first API page, because inside `reference/` the `components/`
 * folder takes 100 from its own index page while `api/` takes 200 from the
 * package pages it holds.
 */
export function firstPagePath(nodes: DocsTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "page") return node.path;
    const nested = firstPagePath(node.children);
    if (nested) return nested;
  }
  return null;
}
