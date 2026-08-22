import type { NavIcon } from "./nav";

/**
 * Where the docs live on GitHub, for the "edit this page" links.
 *
 * The repo name and branch are constants rather than env vars: docs are now
 * compiled into the bundle from this repository's own `docs/` folder at build
 * time, so the source of a rendered page is always this repo on its default
 * branch — there is nothing per-environment to configure.
 */
export const DOCS_REPO = "DevDogs-Website";
export const DOCS_BRANCH = "main";

/**
 * The mark shown for each documented project — in the sidebar's project
 * switcher, the navbar's Docs menu, and on the docs landing page.
 *
 * Keyed by docs slug, which is the name of the project's workspace directory
 * (`docs/schedule-builder/` documents `apps/schedule-builder`). The icon and
 * fill are the ones that project already wears in the fullscreen app
 * switcher, so DogDays is the same red calendar wherever you meet it —
 * ~/config/projects.ts holds those originals, and a project whose mark
 * changes there wants the matching change here.
 *
 * A project absent from this map is not an error: it falls back to the
 * generic book below, which is what a newly documented project gets before
 * anyone has chosen a mark for it.
 */
export const DOCS_PROJECT_MARKS: Record<
  string,
  { icon: NavIcon; iconBg: string }
> = {
  platform: { icon: "HouseIcon", iconBg: "bg-cyan-400" },
  "schedule-builder": { icon: "CalendarDotsIcon", iconBg: "bg-red-400" },
  "study-group-finder": { icon: "UsersIcon", iconBg: "bg-purple-400" },
};

export const DOCS_FALLBACK_MARK = {
  icon: "BookOpenIcon",
  iconBg: "bg-mauve-300",
} as const satisfies { icon: NavIcon; iconBg: string };

export function docsProjectMark(slug: string) {
  return DOCS_PROJECT_MARKS[slug] ?? DOCS_FALLBACK_MARK;
}
