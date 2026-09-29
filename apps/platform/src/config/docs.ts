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
 * (`docs/schedule-builder/` documents `apps/schedule-builder`). The icon and
 * fill are the ones that project already wears in the fullscreen app switcher.
 * ~/config/projects.ts holds those originals, and a project whose mark changes
 * there wants the matching change here.
 *
 * A project absent from this map is not an error: it falls back to the generic
 * book below, which is what a newly documented project gets before anyone
 * picks a mark for it.
 */
export const DOCS_PROJECT_MARKS: Record<
  string,
  { icon: NavIcon; iconBg: string }
> = {
  platform: { icon: "HouseIcon", iconBg: "bg-cyan-400" },
  "schedule-builder": { icon: "DogDaysIcon", iconBg: "bg-red-400" },
  "study-group-finder": { icon: "DogPackIcon", iconBg: "bg-purple-400" },
  workshops: { icon: "ChalkboardTeacherIcon", iconBg: "bg-amber-400" },
};

export const DOCS_FALLBACK_MARK = {
  icon: "BookOpenIcon",
  iconBg: "bg-mauve-300",
} as const satisfies { icon: NavIcon; iconBg: string };

export function docsProjectMark(slug: string) {
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
 * two projects everyone eventually touches regardless of team. `sandbox` is
 * in neither list on purpose — still built and still reachable at
 * `/docs/sandbox`, just not a choice this page hands a newcomer.
 */
export const DOCS_LANDING_LARGE: readonly string[] = [
  "schedule-builder",
  "study-group-finder",
];
export const DOCS_LANDING_SMALL: readonly string[] = ["platform", "toolkit"];
/** The workshop write-ups, for anyone catching up on a meeting. */
export const DOCS_LANDING_WORKSHOPS: readonly string[] = ["workshops"];
