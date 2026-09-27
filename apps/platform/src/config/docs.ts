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
 * How the documented projects are grouped in the navbar menu and the sidebar
 * switcher. The landing page (`(site)/docs/page.tsx`) does NOT read this: it
 * has its own layout per the docs contract's "Which team are you on?" rule —
 * schedule-builder and study-group-finder as the large front-door cards,
 * platform and toolkit as a smaller row, sandbox reachable by URL but off the
 * page entirely. See `DOCS_LANDING_LARGE`/`DOCS_LANDING_SMALL` below.
 *
 * Five projects listed flat is an accurate list and a poor menu: it puts four
 * deployables and a set of shared packages on one level, so a newcomer reads
 * five equal choices with no way to tell which to open first. The groups say
 * what kind of thing each project is.
 *
 * Membership only. Projects keep the order their `order:` frontmatter gives
 * them WITHIN a group. The group decides which heading a project sits under and
 * the sequence of the headings, and nothing else, so there is still one source
 * of truth for where a project sits among its peers.
 *
 * A project missing from every group is not an error and must never vanish: it
 * collects under `UNGROUPED_LABEL` at the end, so documenting a new project is
 * one folder in `docs/` and nothing here, and forgetting this file costs a
 * heading rather than the entry.
 */
export const DOCS_GROUPS: readonly {
  id: string;
  label: string;
  /**
   * Which side of the navbar menu's two-column layout this group takes.
   * Omitted means left. Only the wide menu reads it. The sidebar switcher and
   * the landing page stack their groups in one column and ignore it.
   */
  column?: "left" | "right";
  slugs: readonly string[];
}[] = [
  {
    id: "apps",
    label: "Apps",
    column: "right",
    slugs: ["platform", "sandbox", "schedule-builder", "study-group-finder"],
  },
  { id: "shared", label: "Shared packages", slugs: ["toolkit"] },
];

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

/** Where a project no group claims ends up. */
export const UNGROUPED_LABEL = "Everything else";

export interface DocsProjectGroup<T> {
  id: string;
  label: string;
  column: "left" | "right";
  projects: T[];
}

/**
 * Partitions projects into `DOCS_GROUPS`, dropping groups that came out empty.
 *
 * Generic over the project shape because its two callers pass two different
 * ones: the navbar's link and the sidebar's switcher row. All this needs from
 * either is `slug`.
 */
export function groupDocsProjects<T extends { slug: string }>(
  projects: T[],
): DocsProjectGroup<T>[] {
  const claimed = new Set<string>();

  const groups = DOCS_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    // Resolved here rather than left optional, so every consumer reads one
    // shape and "no side declared" is answered in one place.
    column: group.column ?? ("left" as const),
    projects: projects.filter((project) => {
      if (!group.slugs.includes(project.slug)) return false;
      claimed.add(project.slug);
      return true;
    }),
  }));

  const rest = projects.filter((project) => !claimed.has(project.slug));
  if (rest.length > 0) {
    groups.push({
      id: "ungrouped",
      label: UNGROUPED_LABEL,
      column: "left" as const,
      projects: rest,
    });
  }

  return groups.filter((group) => group.projects.length > 0);
}
