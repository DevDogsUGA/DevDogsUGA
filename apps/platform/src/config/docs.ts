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
 * The mark shown for each documented project, in the sidebar's project
 * switcher, the navbar's Docs menu, and on the docs landing page.
 *
 * Keyed by docs slug, which is the name of the project's workspace directory
 * (`docs/schedule-builder/` documents `apps/schedule-builder`). Each project
 * wears the icon it has elsewhere:
 *
 * - `logo`: the platform is DevDogs itself, so it gets the mascot, bare, as
 *   in the navbar and the browser tab.
 * - `glyph`: everything else is a bare mark in `color`, with no tile. An app
 *   (DogDays, DogPack) gets its own logo from
 *   components/ProjectsSection/project-icons in its brand color, as its
 *   project card shows it; a project that is not an app (the toolkit, the
 *   workshops) gets a filled Phosphor glyph in a color of its own.
 *
 * `iconBg` is the fill for the tiles on a project's folder pages. A
 * project absent from this map is not an error: it falls back to the generic
 * book below, which is what a newly documented project gets before anyone
 * picks a mark for it.
 */
export interface DocsProjectMarkSpec {
  kind: "logo" | "glyph";
  icon: NavIcon;
  /** The glyph's color: a Tailwind text class. */
  color: string;
  iconBg: string;
}

export const DOCS_PROJECT_MARKS: Record<string, DocsProjectMarkSpec> = {
  platform: {
    kind: "logo",
    icon: "HouseIcon",
    color: "text-cyan-400",
    iconBg: "bg-cyan-400",
  },
  // DogDays' primary on a dark surface (apps/schedule-builder globals.css).
  "schedule-builder": {
    kind: "glyph",
    icon: "DogDaysIcon",
    color: "text-red-600",
    iconBg: "bg-red-400",
  },
  // DogPack's purple, a step lighter than its card title's so it reads on
  // the dark surface.
  "study-group-finder": {
    kind: "glyph",
    icon: "DogPackIcon",
    color: "text-purple-500",
    iconBg: "bg-purple-400",
  },
  toolkit: {
    kind: "glyph",
    icon: "ToolboxIcon",
    color: "text-sky-400",
    iconBg: "bg-sky-400",
  },
  workshops: {
    kind: "glyph",
    icon: "ChalkboardTeacherIcon",
    color: "text-amber-400",
    iconBg: "bg-amber-400",
  },
};

export const DOCS_FALLBACK_MARK: DocsProjectMarkSpec = {
  kind: "glyph",
  icon: "BookOpenIcon",
  color: "text-mauve-300",
  iconBg: "bg-mauve-300",
};

export function docsProjectMark(slug: string): DocsProjectMarkSpec {
  return DOCS_PROJECT_MARKS[slug] ?? DOCS_FALLBACK_MARK;
}

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

/**
 * How the sidebar's project switcher names each project: its brand, when it
 * has one, over a tagline that fits on one line. The brands and taglines are
 * the ones ~/config/projects.ts gives the apps (DogDays is the schedule
 * builder), so a project renamed there wants the matching change here.
 *
 * A project absent from this map shows its docs name and its `description`,
 * cut to one line.
 */
export const DOCS_PROJECT_LABELS: Record<
  string,
  { name: string; tagline: string }
> = {
  platform: {
    name: "DevDogs Platform",
    tagline: "Member Portal and Dev Tools",
  },
  "schedule-builder": { name: "DogDays", tagline: "Schedule Builder" },
  "study-group-finder": { name: "DogPack", tagline: "Study Group Finder" },
  toolkit: { name: "Toolkit", tagline: "Shared Packages and Tooling" },
  workshops: { name: "Workshops", tagline: "Meeting Slides and Code" },
};

/**
 * The docs landing page's own layout (contract item 4: "Which team are you
 * on?"). Large front-door cards for the two competition apps a new
 * contributor is actually choosing between; a smaller row underneath for the
 * two projects everyone eventually touches regardless of team.
 */
export const DOCS_LANDING_LARGE: readonly string[] = [
  "schedule-builder",
  "study-group-finder",
];
export const DOCS_LANDING_SMALL: readonly string[] = ["platform", "toolkit"];
/** The workshop write-ups, for anyone catching up on a meeting. */
export const DOCS_LANDING_WORKSHOPS: readonly string[] = ["workshops"];
