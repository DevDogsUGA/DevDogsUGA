import {
  DOCS_MENU,
  DOCS_MENU_PROJECTS,
  type DocsMark,
  type DocsMenuEntry,
  type DocsMenuItem,
} from "~/config/docs";
import { getContributeProjects, PLATFORM_SLUG } from "./contribute";
import { getDocsProjects, type DocsProject } from "./queries";

/**
 * The two navbar menus, as data: **Docs** (platform-authored documentation:
 * Workshops, Shared tooling, Ops and the guides for building on DevDogs) and
 * **Contribute** (project-authored: the platform's contributor docs first, then
 * every Project whose docs have published). The same entries feed the menus,
 * the docs landing page, the sidebar's project switcher and the terminal, so
 * they cannot disagree.
 *
 * Docs rows come from `DOCS_MENU` and the docs' own frontmatter. Contribute
 * rows are Projects: a row's name, tagline and its icon and color keys are read
 * from the Project, through the showcase registry when drawn, and never from a
 * map in the code. A bundled docs project with no row of its own (the
 * DogDays docs today) lists under its docs name with a generic mark until it
 * has one.
 */

function sectionMark(item: DocsMenuItem): DocsMark {
  return {
    kind: "section",
    icon: item.icon,
    ...(item.hue ? { hue: item.hue } : {}),
  };
}

/** The docs project an `/docs/<project>/…` address is inside. */
function projectOf(href: string): string | null {
  const [, docs, project] = href.split("/");
  return docs === "docs" && project ? project : null;
}

/** The Docs menu: only rows whose docs have something to read. */
export async function getDocsMenu(): Promise<DocsMenuEntry[]> {
  const visible = new Map(getDocsProjects().map((p) => [p.slug, p]));
  return DOCS_MENU.flatMap((item): DocsMenuEntry[] => {
    if (item.project) {
      const project = visible.get(item.project);
      return project
        ? [
            {
              id: item.id,
              href: item.href,
              name: project.name,
              description: project.description,
              mark: sectionMark(item),
              project: project.slug,
            },
          ]
        : [];
    }
    const inside = projectOf(item.href);
    if (inside === null || !visible.has(inside)) return [];
    return [
      {
        id: item.id,
        href: item.href,
        name: item.name ?? item.id,
        description: item.description ?? null,
        mark: sectionMark(item),
        project: null,
        ...(item.covers ? { covers: item.covers } : {}),
      },
    ];
  });
}

/**
 * The Contribute menu: the platform first, then the other bundled project docs,
 * then the Projects that publish their own, in the order their showcase gives.
 */
export async function getContributeMenu(): Promise<DocsMenuEntry[]> {
  const visible = getDocsProjects();
  const rows = await getContributeProjects();
  const byRow = new Map(rows.map((row) => [row.slug, row]));
  const bundled = visible.filter((p) => !DOCS_MENU_PROJECTS.has(p.slug));
  const bundledSlugs = new Set(bundled.map((p) => p.slug));

  const entryFor = (slug: string, project?: DocsProject): DocsMenuEntry => {
    const row = byRow.get(slug);
    return {
      id: slug,
      href: `/docs/${encodeURIComponent(slug)}`,
      name: row?.name ?? project?.name ?? slug,
      description: row
        ? (row.tagline ?? row.description)
        : (project?.description ?? null),
      mark: row
        ? { kind: "project", iconKey: row.iconKey, colorKey: row.colorKey }
        : { kind: "fallback" },
      project: slug,
    };
  };

  const entries = [
    ...bundled.map((p) => entryFor(p.slug, p)),
    ...rows
      .filter((r) => !bundledSlugs.has(r.slug))
      .map((r) => entryFor(r.slug)),
  ];
  return [
    ...entries.filter((e) => e.id === PLATFORM_SLUG),
    ...entries.filter((e) => e.id !== PLATFORM_SLUG),
  ];
}

/** One project in the docs sidebar's switcher. */
export interface DocsSwitcherEntry {
  slug: string;
  name: string;
  description: string | null;
  mark: DocsMark;
}

/**
 * Every bundled docs project a reader can open, named and marked as the menus
 * name and mark it: a Docs section by its own docs, a Project by its row.
 */
export async function getDocsSwitcher(): Promise<DocsSwitcherEntry[]> {
  const visible = getDocsProjects();
  const contribute = await getContributeMenu();
  const contributeBySlug = new Map(
    contribute.flatMap((e) => (e.project ? [[e.project, e] as const] : [])),
  );
  return visible.map((project): DocsSwitcherEntry => {
    const item = DOCS_MENU.find((i) => i.project === project.slug);
    if (item) {
      return {
        slug: project.slug,
        name: project.name,
        description: project.description,
        mark: sectionMark(item),
      };
    }
    const entry = contributeBySlug.get(project.slug);
    return {
      slug: project.slug,
      name: entry?.name ?? project.name,
      description: entry ? entry.description : project.description,
      mark: entry?.mark ?? { kind: "fallback" },
    };
  });
}
