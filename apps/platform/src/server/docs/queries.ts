import {
  folders,
  pages,
  projects,
  variantGroups,
  type DocsPage,
  type DocsProject,
} from "@devdogsuga/docs";
import { cacheLife } from "next/cache";
import { projectPath, splitProjectPath } from "~/lib/docsSlug";
import { toTitleCase } from "~/lib/toTitleCase";
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
// its project.
//
// What a reader may SEE is not constant, though: a page or folder can carry a
// `scheduled:` time (`publishAt` here), and until it passes it must not appear
// anywhere: not the sidebar, the pager, a folder's contents, the page itself,
// the search, the sitemap or the link card. Every public read below goes
// through `visibleView`, which drops what is not live yet.
//
// `mode: "preview"` is the other reading: everything, with what is still ahead
// of its time carrying `publishAt` so the UI can mark it. It backs
// `/preview/docs`, which is never cached and only served to a role that holds
// `canPreviewDocs`.

export type { DocsProject };

export type DocsMode = "public" | "preview";

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
  /** UTC ISO. In the public view a row is only present once it has passed. */
  publishAt: string | null;
}

/** Something a reader is told is coming, on the landing page. */
export interface DocsUpcoming {
  /** What to call it: a top-level folder's name, or the project's. */
  name: string;
  publishAt: string;
}

/** One project's pages and folders as a reader may see them right now. */
interface DocsView {
  rows: DocsRow[];
  folders: DocsFolderSettings[];
  /** Top-level things still ahead of their time, soonest first. */
  upcoming: DocsUpcoming[];
}

function allRows(project: string): DocsRow[] {
  return pages
    .filter((page) => page.project === project)
    .map((page) => ({
      path: splitProjectPath(page.path).path,
      title: page.title,
      description: page.description,
      order: page.order,
      section: page.section,
      publishAt: page.publishAt,
    }));
}

function allFolderSettings(project: string): DocsFolderSettings[] {
  return folders
    .filter((folder) => folder.project === project)
    .map(({ path, name, order, steps, publishAt }) => ({
      path: splitProjectPath(path).path,
      name,
      order,
      steps,
      ...(publishAt ? { publishAt } : {}),
    }));
}

/**
 * The project as of `now`: what is live, and what is on its way.
 *
 * `upcoming` is the outermost folders that are still hidden, or the project
 * itself when nothing in it is live and no folder names what is coming. A lone
 * scheduled page inside a live folder is not listed: the landing page names
 * destinations, and one page is not one.
 */
function viewAt(project: string, now: number, mode: DocsMode): DocsView {
  const live = (publishAt: string | null) =>
    publishAt === null || Date.parse(publishAt) <= now;
  const rows = allRows(project);
  const settings = allFolderSettings(project);

  const upcoming: DocsUpcoming[] = [];
  const liveRows = rows.filter((row) => live(row.publishAt));
  const byPath = new Map(settings.map((folder) => [folder.path, folder]));
  for (const folder of settings) {
    if (live(folder.publishAt ?? null)) continue;
    const segments = folder.path.split("/");
    const above = segments
      .slice(0, -1)
      .map((_, i) => segments.slice(0, i + 1).join("/"));
    // Listed once, at the outermost folder that is hidden: everything inside
    // it is hidden with it, and "Supabase: Oct 5" says all there is to say.
    if (above.some((path) => !live(byPath.get(path)?.publishAt ?? null))) {
      continue;
    }
    const names = [
      ...above.map(
        (path) =>
          byPath.get(path)?.name ?? toTitleCase(path.split("/").at(-1)!),
      ),
      folder.name,
    ];
    upcoming.push({ name: names.join(" / "), publishAt: folder.publishAt! });
  }
  if (liveRows.length === 0 && rows.length > 0 && upcoming.length === 0) {
    // Nothing in the project is live and no folder names what is coming: the
    // project itself is what is coming.
    const first = rows
      .map((row) => row.publishAt)
      .filter((at): at is string => at !== null)
      .sort()[0];
    if (first) {
      const name = projects.find((p) => p.slug === project)?.name ?? project;
      upcoming.push({ name, publishAt: first });
    }
  }
  upcoming.sort((a, b) => a.publishAt.localeCompare(b.publishAt));

  if (mode === "public") {
    // Past times are dropped from what is returned: a live page has no
    // schedule as far as a reader is concerned, and the cached entry stays
    // smaller for it.
    return {
      rows: liveRows.map((row) => ({ ...row, publishAt: null })),
      folders: settings
        .filter((folder) => live(folder.publishAt ?? null))
        .map((folder) => ({ ...folder, publishAt: undefined })),
      upcoming,
    };
  }

  // The preview keeps everything and marks only what is still ahead: a time
  // that has passed is live, and calling it "Scheduled" would be wrong.
  return {
    rows: rows.map((row) =>
      live(row.publishAt) ? { ...row, publishAt: null } : row,
    ),
    folders: settings.map((folder) =>
      live(folder.publishAt ?? null)
        ? { ...folder, publishAt: undefined }
        : folder,
    ),
    upcoming,
  };
}

/**
 * The public view of one project, cached until it next changes.
 *
 * ## Why this is a `"use cache"` function
 *
 * The docs routes are cached HTML, and what a page shows depends on the clock:
 * a workshop's pages appear when their time passes, with no deploy. The
 * platform's cache has no way to be told "something became visible", so the
 * lookup carries its lifetime instead. A project with a reveal ahead reports
 * the time until then as its `cacheLife`; vinext gives a rendered page the
 * SHORTEST `cacheLife` seen while rendering it, so that becomes the page's
 * lifetime, for the HTML and the in-site navigation (RSC) copy alike. `expire`
 * equals `revalidate`, so there is no stale-while-revalidate window: nothing is
 * served past the moment, and the first request after a reveal renders fresh.
 *
 * A project with nothing ahead reports `"max"`, "until deploy" for a page whose
 * data is a build-time constant. Without any call a `"use cache"` scope
 * defaults to fifteen minutes, which would drag every docs page down to it.
 *
 * ## Why the arguments are what they are
 *
 * vinext records a cached function's lifetime as it was WHEN THE ENTRY WAS
 * WRITTEN, not what is left of it: a render that hits an entry ten minutes old
 * still reports the full figure, and would be held ten minutes past the reveal.
 * (Verified in a production build; see `resolveCacheLife` and the entry hit path
 * in vinext's cache runtime.) So the entry is keyed by the minute as well as
 * the project, which bounds how old a hit can be to one, and the lifetime is
 * shortened by that minute so a hit can only expire a little EARLY, never late.
 * The reveal time is in the key too, so entries written before one reveal are
 * never read after it. A project with nothing ahead passes zero for both and
 * keeps one entry for good.
 */
async function visibleView(
  project: string,
  nextRevealAt: number,
  minute: number,
): Promise<DocsView> {
  "use cache";
  void minute; // Part of the key, and deliberately nothing else.
  const now = Date.now();
  const view = viewAt(project, now, "public");

  if (nextRevealAt === 0) {
    cacheLife("max");
  } else {
    const seconds = Math.max(
      1,
      Math.floor((nextRevealAt - now) / 1000) - REVEAL_MARGIN_SECONDS,
    );
    cacheLife({
      stale: Math.min(seconds, 30),
      revalidate: seconds,
      expire: seconds,
    });
  }
  return view;
}

/** One minute: how old a cached hit can be, and so how early a page expires. */
const REVEAL_MARGIN_SECONDS = 60;

/** The soonest time, after `now`, that something in the project becomes live. */
function nextReveal(project: string, now: number): number | null {
  let next: number | null = null;
  const consider = (publishAt: string | null | undefined) => {
    if (!publishAt) return;
    const at = Date.parse(publishAt);
    if (at > now && (next === null || at < next)) next = at;
  };
  for (const row of allRows(project)) consider(row.publishAt);
  for (const folder of allFolderSettings(project)) consider(folder.publishAt);
  return next;
}

async function viewOf(project: string, mode: DocsMode): Promise<DocsView> {
  // A plain function, not a cache scope: the preview must never be cached.
  if (mode === "preview") return viewAt(project, Date.now(), "preview");

  // The clock is read here, outside the cache scope, so that it can be part of
  // the key. See `visibleView`.
  const now = Date.now();
  const next = nextReveal(project, now);
  return next === null
    ? visibleView(project, 0, 0)
    : visibleView(project, next, Math.floor(now / 60_000));
}

/** The setup axes pages vary by (platform, Supabase), with their labels. */
export function getDocsVariantGroups(): typeof variantGroups {
  return variantGroups;
}

/**
 * Every project, live or not. For callers that only need to know a slug is a
 * project (support routing). Anything a reader sees goes through
 * `getVisibleDocsProjects`.
 */
export function getDocsProjects(): DocsProject[] {
  return projects;
}

/**
 * The projects a reader can open: those with at least one live page.
 *
 * A project with a page that is never scheduled is open, full stop, and is
 * answered from the bundle without touching `visibleView`. That matters for the
 * cache: this runs in every docs page's layout, and every read of `visibleView`
 * lends the page that project's reveal time. Asking it about a project that can
 * never be empty would tie a page in one project to another project's calendar.
 */
export async function getVisibleDocsProjects(
  mode: DocsMode = "public",
): Promise<DocsProject[]> {
  const open = await Promise.all(
    projects.map(async (project) => {
      if (mode === "preview") return true;
      const rows = allRows(project.slug);
      if (rows.some((row) => row.publishAt === null)) return true;
      return (await viewOf(project.slug, "public")).rows.length > 0;
    }),
  );
  return projects.filter((_, i) => open[i]);
}

/** What the landing page tells readers is coming, per project. */
export async function getDocsUpcoming(): Promise<Map<string, DocsUpcoming[]>> {
  const upcoming = new Map<string, DocsUpcoming[]>();
  for (const project of projects) {
    const view = await viewOf(project.slug, "public");
    if (view.upcoming.length > 0) upcoming.set(project.slug, view.upcoming);
  }
  return upcoming;
}

function treeRows(view: DocsView) {
  return view.rows.map((row) => ({
    path: row.path,
    title: row.title,
    order: row.order,
    ...(row.publishAt ? { publishAt: row.publishAt } : {}),
  }));
}

/**
 * The sidebar tree for one project. Pages are returned with project-relative
 * paths, so the tree and the URLs it builds never carry the project prefix.
 */
export async function getDocsTree(
  project: string,
  mode: DocsMode = "public",
): Promise<DocsTreeNode[]> {
  const view = await viewOf(project, mode);
  return buildDocsTree(treeRows(view), view.folders);
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
  mode: DocsMode = "public",
): Promise<DocsSidebarTree> {
  const view = await viewOf(project, mode);
  const rows: DocsSidebarPageInput[] = view.rows.map((row) => ({
    path: row.path,
    title: row.title,
    order: row.order,
    section: row.section,
    ...(row.publishAt ? { publishAt: row.publishAt } : {}),
  }));
  return buildDocsSidebarSections(rows, view.folders);
}

/** The folder at a project-relative path, or null if there is none. */
export async function getDocsFolder(
  project: string,
  path: string,
  mode: DocsMode = "public",
): Promise<DocsTreeFolder | null> {
  return findFolder(await getDocsTree(project, mode), path);
}

/** One entry in a folder's contents grid. */
export interface DocsFolderEntry {
  kind: "page" | "folder";
  /** Project-relative path: the page's own, or the subfolder's. */
  path: string;
  title: string;
  description: string | null;
  /** Preview only: when it goes live, if that is still ahead. */
  publishAt?: string;
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
          ...(node.publishAt ? { publishAt: node.publishAt } : {}),
        }
      : {
          kind: "page" as const,
          path: node.path,
          title: node.title,
          description:
            pagesByPath.get(projectPath(project, node.path))?.description ??
            null,
          ...(node.publishAt ? { publishAt: node.publishAt } : {}),
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
  /** Preview only: when it goes live, if that is still ahead. */
  publishAt: string | null;
}

/** Null for a page that does not exist, and for one that is not live yet. */
export async function getDocsPage(
  project: string,
  path: string,
  mode: DocsMode = "public",
): Promise<DocsPageContent | null> {
  const page = pagesByPath.get(projectPath(project, path));
  if (!page) return null;

  const row = (await viewOf(project, mode)).rows.find((r) => r.path === path);
  if (!row) return null;

  return {
    title: page.title,
    description: page.description,
    headings: page.headings,
    html: page.html,
    // The compiler's `mountedFrom` is relative to `_shared/`; this one is
    // relative to `docs/`, like every other path the edit link is built from.
    mountedFrom:
      page.mountedFrom === null ? null : `_shared/${page.mountedFrom}`,
    publishAt: row.publishAt,
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
    publishAt?: string;
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
  mode: DocsMode = "public",
): Promise<DocsStepNav | null> {
  const position = stepPositionOf(await getDocsTree(project, mode), path);
  if (!position) return null;
  return {
    course: position.folder.name,
    steps: position.steps.map(({ path, title, publishAt }) => {
      const checkpoint = pagesByPath.get(projectPath(project, path))
        ?.frontmatter?.checkpoint;
      return {
        path,
        title,
        ...(publishAt ? { publishAt } : {}),
        ...(typeof checkpoint === "string" ? { checkpoint } : {}),
      };
    }),
    index: position.index,
  };
}

/**
 * Whether the bundle holds a page or folder at this path at all, live or not.
 * Together with a lookup that came back null, that means "scheduled".
 */
export function docsPathExists(project: string, path: string): boolean {
  const full = projectPath(project, path);
  return (
    pagesByPath.has(full) ||
    pages.some((page) => page.path.startsWith(`${full}/`))
  );
}

/** Every live page's project-relative path, for the sitemap. */
export async function getDocsPagePaths(project: string): Promise<string[]> {
  return (await viewOf(project, "public")).rows.map((row) => row.path);
}
