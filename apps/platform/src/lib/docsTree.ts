/** The docs sidebar tree, folded from the flat (path, title, order) page rows. */
import { toTitleCase } from "./toTitleCase";

/**
 * The fixed sidebar sections every documented project is grouped into, in the
 * order they are always drawn: Overview first (handled separately, see
 * `buildDocsSidebarSections`), then these four. A project's pages rarely fill
 * all four — a small app may have no Infrastructure page at all — so an empty
 * section is dropped rather than drawn as a heading over nothing.
 */
export const DOCS_SECTION_IDS = [
  "getting-started",
  "guides",
  "infrastructure",
  "reference",
] as const;

export type DocsSectionId = (typeof DOCS_SECTION_IDS)[number];

export const DOCS_SECTION_LABELS: Record<DocsSectionId, string> = {
  "getting-started": "Getting started",
  guides: "Guides",
  infrastructure: "Infrastructure",
  reference: "Reference",
};

export interface DocsTreePage {
  type: "page";
  /** Slash-joined slug below docs/, e.g. "guides/setup". */
  path: string;
  title: string;
  /** The page's `order:` frontmatter, or null when it declares none. */
  order: number | null;
  /**
   * When the page goes live (UTC ISO), set only in the preview, where pages
   * still ahead of their time are listed and marked. Public trees never hold
   * one, because a page that is not live yet is not in them at all.
   */
  publishAt?: string;
}

export interface DocsTreeFolder {
  type: "folder";
  name: string;
  /** The path segment this folder occupies. */
  segment: string;
  /**
   * Slash-joined project-relative path to this folder, e.g.
   * "guides/deployment". The same shape a page's `path` has, and what the
   * folder's own URL is built from.
   */
  path: string;
  /**
   * Its settings' `order` when it has settings, else derived. See
   * `folderOrder`. Null means the default.
   */
  order: number | null;
  /** Its settings say `steps: true`: its pages are read in order. */
  steps: boolean;
  /** As on `DocsTreePage`: the folder's reveal time, preview only. */
  publishAt?: string;
  children: DocsTreeNode[];
}

/**
 * A folder's own settings, from a body-less `index.md` (see the compiler's
 * `DocsFolder`), keyed by project-relative path when handed to the builders.
 */
export interface DocsFolderSettings {
  path: string;
  name: string;
  order: number | null;
  steps: boolean;
  /** Preview only, as on `DocsTreeFolder`. */
  publishAt?: string;
}

export type DocsTreeNode = DocsTreePage | DocsTreeFolder;

/**
 * Where a page or folder that declares no `order` sits. The same number
 * `@devdogsuga/docs-kit`'s compiler defaults projects to, and deliberately
 * mid-range: a page can be promoted above the pages that never think about
 * ordering as well as demoted below them. This module is handed plain rows
 * rather than that package's types and has no dependency on it, so the constant
 * lives in both places.
 */
const DEFAULT_ORDER = 100;

/**
 * Whether a node is the page its folder itself resolves to.
 *
 * Exported because the sidebar relabels exactly these rows (see
 * `DOCS_INDEX_LABEL`), and a second definition of "is this the index" would be
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
 * Where a folder sits among ITS siblings, a different question from the one its
 * children's numbers answer: `order` is a position within one folder, so a
 * folder that says nothing about itself has nothing to inherit. The cascade is
 * its own index page, then (below the top level only) the smallest number
 * anything inside it declares, then nothing.
 *
 * The index page wins when it has a number because it is the one place an
 * author can say where a section goes: `guides/index.md` with `order: 5` is a
 * statement about `guides/`. That branch has a second, accidental source. The
 * generator writes `reference/components/index.md` with the slot that group
 * took among the COMPONENT groups, not with an opinion about where
 * `components/` belongs among `reference/`'s children: `order: 118` in platform
 * is the 19th of that project's component groups, `order: 103` in
 * schedule-builder the 4th of its ten. Both land in the same gap the fallback
 * would (after `api-routes` at 3, before the symbol pages at 200), so nothing
 * is wrong today, but the number drifts as component groups are added and
 * renamed.
 *
 * The fallback takes the SMALLEST declared number, because a section starts
 * where its earliest content starts. The generator numbers a folder's pages as
 * a run following the page that names it (`reference/server.md` is 203,
 * `reference/server/*` runs 204 to 222), so the smallest puts `Server/`
 * immediately after `server`, the row a reader is looking under. The largest
 * would land it in the same gap here, but breaks where a folder's children are
 * not one run: `toolkit/reference/api/` holds seven package pages all at
 * `order: 200`, because each package is a separate generator target restarting
 * the sequence, and its subfolders restart too. The largest sorted those
 * subfolders by how many pages they happen to hold, `Devtools/` last with nine
 * and `Docs Build/` first with one.
 *
 * An unnumbered child counts at the default 100, the same number
 * `effectiveOrder` hands it. Reading only the numbers somebody wrote would let
 * a folder claim to start where no row inside it sits: a folder holding an
 * unnumbered page and a page at `order: 300` would answer 300, while the row a
 * reader meets on opening it is the unnumbered one, sorted at 100. It would
 * also read that 300 backwards, since the number says the page goes last INSIDE
 * the folder, and the folder would answer null before it was written and 300
 * after, so sending one page to the back would drag the section back with it.
 * The default can never cost a folder an early slot: `Math.min` keeps the
 * smaller, so a folder whose only declared number is 1 still answers 1.
 *
 * A folder with nothing declared anywhere inside is the one case that stays
 * null instead of answering 100, because null is what `DocsTreeFolder.order`
 * means by "no opinion, take the default". `effectiveOrder` turns it back into
 * 100, so the distinction is in what the field says, not where the folder
 * lands.
 *
 * None of which decides anything in `docs/` as it stands today. This fallback
 * runs only below the top level; every folder below the top level in the corpus
 * is generated under some project's `reference/`; and every generated page
 * carries an `order`. So no folder that reaches here holds an unnumbered child,
 * and the two readings agree on every folder in every project. The pages that
 * declare no order are all hand-written and sit either at a project's top level
 * or inside `platform/documentation-system/`, which is itself depth 0 and has
 * already returned null above. The rule is written for the hand-written folder
 * somebody nests tomorrow.
 *
 * The derivation stops at the top level, which is `depth`'s only job here. A
 * depth-0 folder is not a row among the pages: `Nodes` in
 * `components/DocsSidebar/Tree.tsx` renders depth-0 nodes as
 * `[...pages, ...folders]`, so it is drawn as a section heading below every
 * loose page whatever number it carries. `Reference/` is last in the platform
 * sidebar because of that partition, and was last before this module read
 * `order` at all. All a derived number could change up there is which section
 * heading precedes which, and `reference/`'s inner numbers are no basis for
 * that: `server-actions.md`'s `order: 1` means "first among reference/'s own
 * pages", and propagating it would put generated reference above the
 * hand-written Documentation System guides. So sections sort by title unless
 * somebody writes an order on the section's own `index.md`. Below the top level
 * the propagation is safe because both ends come from the same generator run
 * over the same project.
 */
function folderOrder(
  folder: DocsTreeFolder,
  depth: number,
  settings: DocsFolderSettings | undefined,
): number | null {
  // A folder's settings are the folder speaking for itself, which is what the
  // index page's number stands in for below.
  if (settings?.order != null) return settings.order;
  const index = indexPageOf(folder);
  if (index?.order != null) return index.order;
  if (depth === 0) return null;

  // This also stands in for a length guard, though nothing needs one:
  // `folderFor` only ever creates a folder at the moment something is pushed
  // into it, so a folder in a built tree always holds at least one node. An
  // empty one would leave through here as null rather than reach `Math.min`
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
 * above it can be sorted. A parent asking `folderOrder` too early would read a
 * nested folder's `order` while it was still the null `folderFor` seeded it
 * with.
 */
function sortTree(
  nodes: DocsTreeNode[],
  depth: number,
  settings: ReadonlyMap<string, DocsFolderSettings>,
): DocsTreeNode[] {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    sortTree(node.children, depth + 1, settings);
    node.order = folderOrder(node, depth, settings.get(node.path));
  }
  return sortNodes(nodes);
}

/**
 * `folderSettings` are the project's folder settings, project-relative. A
 * folder with none is named after its directory and placed by what it holds.
 */
export function buildDocsTree(
  pages: {
    path: string;
    title: string;
    order: number | null;
    publishAt?: string;
  }[],
  folderSettings: readonly DocsFolderSettings[] = [],
): DocsTreeNode[] {
  const settings = new Map(
    folderSettings.map((folder) => [folder.path, folder]),
  );
  const root: DocsTreeNode[] = [];
  const folders = new Map<string, DocsTreeFolder>();

  function folderFor(segments: string[]): DocsTreeNode[] {
    if (segments.length === 0) return root;
    const key = segments.join("/");
    let folder = folders.get(key);
    if (!folder) {
      folder = {
        type: "folder",
        name: settings.get(key)?.name ?? toTitleCase(segments.at(-1)!),
        segment: segments.at(-1)!,
        path: key,
        order: null,
        steps: settings.get(key)?.steps ?? false,
        ...(settings.get(key)?.publishAt
          ? { publishAt: settings.get(key)!.publishAt }
          : {}),
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
      ...(page.publishAt ? { publishAt: page.publishAt } : {}),
    });
  }

  return sortTree(root, 0, settings);
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
 * The index page sitting directly inside a folder, if it has one: the page a
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

/** Every folder in the tree, at any depth. One per prerendered folder route. */
export function allFolders(nodes: DocsTreeNode[]): DocsTreeFolder[] {
  return nodes.flatMap((node) =>
    node.type === "folder" ? [node, ...allFolders(node.children)] : [],
  );
}

/**
 * Depth-first first page, where `/docs/<project>` redirects to. It walks the
 * array as `buildDocsTree` left it rather than as the sidebar draws it, and the
 * two do disagree at the top level: the sidebar's partition gathers folders
 * below the pages, while the array leaves them interleaved by title, so a
 * folder can sort between two loose pages there instead of trailing every page
 * the way the sidebar draws it. What keeps this from descending into a section
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

/** One row's worth of input to `buildDocsSidebarSections`: everything
 * `buildDocsTree` itself takes, plus the section a page's compiled frontmatter
 * resolved to. `null` marks the project's own root index page, the one page
 * that sits outside the four sections entirely (see `DocsSidebarTree.overview`). */
export interface DocsSidebarPageInput {
  path: string;
  title: string;
  order: number | null;
  section: DocsSectionId | null;
  publishAt?: string;
}

export interface DocsSidebarSection {
  id: DocsSectionId;
  label: string;
  nodes: DocsTreeNode[];
}

export interface DocsSidebarTree {
  /** The project's own root index page, drawn as "Overview" ahead of every
   * section rather than folded into one. Null for a project with no root
   * index.md, which is not a real case in `docs/` today but costs nothing to
   * leave unhandled-safe. */
  overview: DocsTreePage | null;
  /** Only the sections that ended up with at least one page, in the fixed
   * Getting started / Guides / Infrastructure / Reference order. */
  sections: DocsSidebarSection[];
}

/**
 * Whether a page IS the project's own root index — as opposed to a folder's
 * own index page one or more levels down (`guides/index`), which is still a
 * normal member of its section. Only a path with no folder segment at all
 * (`index`, not `guides/index`) is the project's Overview.
 */
function isProjectOverviewPath(path: string): boolean {
  if (path.includes("/")) return false;
  const name = path.toLowerCase();
  return name === "index" || name === "readme";
}

/**
 * Groups one project's pages into the sidebar's fixed sections, per the docs
 * contract: Overview (the project's own index page, no section of its own),
 * then Getting started, Guides, Infrastructure, Reference, each dropped when
 * it holds nothing.
 *
 * Each section is its own call to `buildDocsTree` over just the pages that
 * landed in it, not a partition of one big tree — the sections are a grouping
 * frontmatter declares per page, orthogonal to the folder path a page happens
 * to live under (a shared page mounted at `getting-started/troubleshooting`
 * and a hand-written one at `guides/troubleshooting-advanced` can both declare
 * `section: getting-started`). That keeps every existing ordering rule
 * (index-page-first, the `order` cascade, the folder-order derivation) intact
 * WITHIN a section, unchanged from what `buildDocsTree` already did before
 * sections existed — this function only decides which section a page's own
 * little tree belongs to.
 */
export function buildDocsSidebarSections(
  pages: DocsSidebarPageInput[],
  folderSettings: readonly DocsFolderSettings[] = [],
): DocsSidebarTree {
  const overviewInput = pages.find((page) => isProjectOverviewPath(page.path));
  const rest = pages.filter((page) => page !== overviewInput);

  const overview: DocsTreePage | null = overviewInput
    ? {
        type: "page",
        path: overviewInput.path,
        title: overviewInput.title,
        order: overviewInput.order,
        ...(overviewInput.publishAt
          ? { publishAt: overviewInput.publishAt }
          : {}),
      }
    : null;

  const sections = DOCS_SECTION_IDS.map((id) => {
    const inSection = rest.filter((page) => (page.section ?? "guides") === id);
    return {
      id,
      label: DOCS_SECTION_LABELS[id],
      nodes: buildDocsTree(inSection, folderSettings),
    };
  }).filter((section) => section.nodes.length > 0);

  return { overview, sections };
}

/** Where a page sits in the ordered course its folder is, if it is in one. */
export interface DocsStepPosition {
  folder: DocsTreeFolder;
  /** The folder's pages, in reading order. */
  steps: DocsTreePage[];
  /** This page's position in `steps`, from 0. */
  index: number;
}

/**
 * The course a page belongs to: its parent folder, when that folder declares
 * `steps: true`. Its steps are the folder's own pages in sidebar order; a
 * subfolder inside a course is not a step.
 */
export function stepPositionOf(
  nodes: DocsTreeNode[],
  path: string,
): DocsStepPosition | null {
  const folder = findFolder(nodes, path.split("/").slice(0, -1).join("/"));
  if (!folder?.steps) return null;
  const steps = folder.children.filter(
    (node): node is DocsTreePage => node.type === "page",
  );
  const index = steps.findIndex((step) => step.path === path);
  return index === -1 ? null : { folder, steps, index };
}
