import type { EventCategory } from "~/lib/eventKind";
import type { NavIcon } from "./nav";

/**
 * Where the docs live on GitHub, for the "edit this page" links.
 *
 * The repo name and branch are constants rather than env vars: docs are
 * compiled into the bundle from this repository's own `docs/` folder at build
 * time, so a rendered page's source is always this repo on its default branch.
 */
export const DOCS_REPO = "DevDogsUGA";
export const DOCS_BRANCH = "main";

/**
 * What draws a docs project's mark, wherever it shows: the navbar menus, the
 * sidebar's project switcher and the docs landing page.
 *
 * - `project`: a Project's own showcase fields. Its `iconKey` and `colorKey`
 *   name entries of the showcase registry (`~/config/showcaseKeys`), so a mark
 *   is never markup or a class an officer typed. The icon is drawn bare in the
 *   color, as the homepage and the app switcher draw it, or as the DevDogs
 *   mascot when the key is the platform's.
 * - `section`: one of the platform's own docs sections (Workshops, Shared
 *   tooling, Ops), which are not Projects and so have no row to read. It wears
 *   a glyph on a tile in the section's hue.
 * - `fallback`: a documented project with no showcase fields, a generic book.
 */
export type DocsMark =
  | { kind: "project"; iconKey: string | null; colorKey: string | null }
  | { kind: "section"; icon: NavIcon; hue?: EventCategory }
  | { kind: "fallback" };

/**
 * One row of the navbar's Docs menu: platform-authored documentation, which is
 * what Docs holds (Q36). Project-authored docs are the Contribute menu's, read
 * from the Projects themselves (`~/server/docs/menu`).
 *
 * A row either names a docs `project` (the folder under `docs/`, whose own
 * `index.md` gives its name and description) or points at a guide inside one,
 * with the words written here. The guides for building on DevDogs live inside
 * the `platform` and `toolkit` folders today, so they are rows that point into
 * them rather than projects of their own; moving a guide into a folder of its
 * own would change only its `href` here.
 */
export interface DocsMenuItem {
  id: string;
  href: string;
  icon: NavIcon;
  /** The tile's color: the event category it shares with the rest of the site. */
  hue?: EventCategory;
  /** The docs project this row opens, whose frontmatter names it. */
  project?: string;
  /** Required for a guide; a project's name comes from its `index.md`. */
  name?: string;
  description?: string;
  /**
   * Other folders this guide spans, for deciding which menu a page belongs to:
   * the reporting contract is part of building a moderated app.
   */
  covers?: readonly string[];
}

export const DOCS_MENU: readonly DocsMenuItem[] = [
  {
    id: "workshops",
    project: "workshops",
    href: "/docs/workshops",
    icon: "ChalkboardTeacherIcon",
    hue: "workshop",
  },
  {
    id: "toolkit",
    project: "toolkit",
    href: "/docs/toolkit",
    icon: "ToolboxIcon",
    hue: "build",
  },
  {
    id: "operations",
    project: "operations",
    href: "/docs/operations",
    icon: "BookOpenIcon",
  },
  {
    id: "oauth",
    href: "/docs/platform/guides/identity",
    icon: "KeyIcon",
    name: "Sign in with DevDogs",
    description: "Let members sign in to your app with their DevDogs account.",
  },
  {
    id: "moderation",
    href: "/docs/platform/guides/moderation",
    icon: "ShieldCheckIcon",
    name: "Moderation",
    description: "Make your app's content reportable and moderatable.",
    covers: ["/docs/platform/guides/reporting"],
  },
  {
    id: "sdk",
    href: "/docs/toolkit/reference/api/sdk",
    icon: "ToolboxIcon",
    name: "SDK",
    description: "The shared client library every DevDogs app builds on.",
  },
];

/** One row of a navbar docs menu, resolved: what it says, where it goes, how it is marked. */
export interface DocsMenuEntry {
  id: string;
  href: string;
  name: string;
  description: string | null;
  mark: DocsMark;
  /**
   * The docs project this opens, so the navbar can mark the menu a reader is
   * inside. Null for a guide that points into another project's folder.
   */
  project: string | null;
  /** Other folders a guide spans; see `DocsMenuItem.covers`. */
  covers?: readonly string[];
}

/** The category hue a docs project's pages wear (headings, active rows), if it has one. */
export function docsProjectHue(slug: string): EventCategory | undefined {
  return DOCS_MENU.find((item) => item.project === slug)?.hue;
}

/** Whether `href` is inside a guide the Docs menu points at (OAuth, moderation, the SDK). */
export function inDocsGuide(href: string): boolean {
  return DOCS_MENU.some(
    (item) =>
      item.project === undefined &&
      [item.href, ...(item.covers ?? [])].some(
        (prefix) => href === prefix || href.startsWith(`${prefix}/`),
      ),
  );
}

/** The docs projects the Docs menu owns; every other bundled project is Contribute's. */
export const DOCS_MENU_PROJECTS: ReadonlySet<string> = new Set(
  DOCS_MENU.flatMap((item) => (item.project ? [item.project] : [])),
);

/**
 * The sidebar label for a folder's own index page.
 *
 * An index page is titled for the thing it introduces, so
 * `docs/toolkit/index.md` is "Shared packages & tooling". That is right for
 * its heading, its breadcrumb and its search result, and wrong for the
 * sidebar, where the folder's name is already on the row above it and the
 * project's name is in the switcher above that, making three copies of one
 * word.
 *
 * So the sidebar alone relabels that row. It is one word for every project
 * rather than a per-page frontmatter field, because the row's job is identical
 * everywhere it appears and a field would invite six different answers to the
 * same question.
 */
export const DOCS_INDEX_LABEL = "Overview";
