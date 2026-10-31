import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { db } from "~/server/db";
import { githubRepos, projectRepos, projects } from "~/server/db/schema";

/**
 * The project showcase: which projects the homepage, the footer and the
 * fullscreen app switcher show, and what they say about each.
 *
 * Both lists are plain server reads of `platform.projects`. A Project is
 * *featured* (the homepage cards and the footer) or *in the switcher* by an
 * officer's toggle, never by its status alone, and only an active Project is
 * ever shown: archiving one takes it off both. What reaches the browser is the
 * projection below and nothing else, so the RLS on `projects` (deny-all, server
 * only) is not a hole: drizzle connects as the owner on the server, inside
 * prerendered shells.
 *
 * Icons and colors are registry keys (`~/config/showcaseKeys`), resolved by
 * the component that draws them, so a stored value is never CSS or HTML.
 */

const SHOWCASE_TAG = "showcase";

/**
 * Marks the showcase stale after a write that changes it: a toggle, a display
 * field, or a Project renamed, described, archived or given another repository.
 * `"max"` is stale-while-revalidate, so the next visitor still gets the old
 * list at once while it rebuilds, and it is legal from a Route Handler as well
 * as a Server Action. Never during render.
 */
export function revalidateShowcase(): void {
  revalidateTag(SHOWCASE_TAG, "max");
}

/**
 * The cache profile both reads share. The footer and the switcher render in the
 * site layout, so these entries sit under every route, and a route's revalidate
 * window is the minimum across its entries (the footer's own comment). A short
 * TTL here would pull the whole site down with it, so the tag is the mechanism
 * and the day is only the backstop for what never calls it: a repository link
 * going unavailable in a sync, a direct database edit, a seed.
 */
const SHOWCASE_LIFE = {
  stale: 300,
  revalidate: 86_400,
  expire: 604_800,
} as const;

/** A featured Project, as the homepage cards and the footer read it. */
export interface ShowcaseProject {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  tagline: string | null;
  yearLabel: string | null;
  /** Why contributions are closed, or any other one-line caveat. */
  note: string | null;
  /** The status pill's words ("Public alpha"), as an officer wrote them. */
  showcaseLabel: string | null;
  iconKey: string | null;
  colorKey: string | null;
  /** Whether anyone can pick up an issue, or only a closed group can. */
  contributionMode: "open" | "closed" | null;
  liveUrl: string | null;
  /** What the live site's button says. */
  liveLabel: string | null;
  switcherUrl: string | null;
  tags: string[];
  /** `https://github.com/<owner>/<name>` for each approved, available repo. */
  githubUrls: string[];
}

/** A Project in the switcher: what a tile needs and no more. */
export interface SwitcherProject {
  id: string;
  name: string;
  /** What it is, in two or three words ("Schedule Builder"). */
  blurb: string | null;
  /**
   * Where the tile navigates. Null means there is nothing to visit yet, and the
   * tile renders disabled. Site paths stay in-app; `https://` ones open a tab.
   */
  url: string | null;
  iconKey: string | null;
  colorKey: string | null;
  /** The pill on the tile's rim; null draws none. */
  badge: string | null;
}

/** The switcher destination that is this site's own front door. */
const HERE_URL = "/";

/**
 * The pill that answers "where am I" instead of "how far along is it", on the
 * tile that leads to the page you are already inside.
 */
const HERE_BADGE = "You are Here";

function mode(value: string | null): ShowcaseProject["contributionMode"] {
  return value === "open" || value === "closed" ? value : null;
}

/**
 * The featured, active Projects in display order, each with the GitHub links of
 * its approved repositories that are still available.
 *
 * A second query rather than a join: a join on a one-to-many multiplies the
 * project columns, and the list is a handful of rows once a day.
 */
export async function getFeaturedProjects(): Promise<ShowcaseProject[]> {
  "use cache";
  cacheLife(SHOWCASE_LIFE);
  cacheTag(SHOWCASE_TAG);

  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      tagline: projects.tagline,
      yearLabel: projects.yearLabel,
      note: projects.note,
      showcaseLabel: projects.showcaseLabel,
      iconKey: projects.iconKey,
      colorKey: projects.colorKey,
      contributionMode: projects.contributionMode,
      liveUrl: projects.liveUrl,
      liveLabel: projects.liveLabel,
      switcherUrl: projects.switcherUrl,
      tags: projects.tags,
    })
    .from(projects)
    .where(and(eq(projects.status, "active"), eq(projects.featured, true)))
    .orderBy(asc(projects.displayOrder), asc(projects.id));
  if (rows.length === 0) return [];

  const links = await db
    .select({
      projectId: projectRepos.projectId,
      owner: githubRepos.owner,
      name: githubRepos.name,
    })
    .from(projectRepos)
    .innerJoin(
      githubRepos,
      eq(githubRepos.githubRepoId, projectRepos.githubRepoId),
    )
    .where(
      and(
        inArray(
          projectRepos.projectId,
          rows.map((row) => row.id),
        ),
        eq(projectRepos.approval, "approved"),
        eq(githubRepos.health, "available"),
      ),
    )
    .orderBy(asc(projectRepos.linkedAt), asc(githubRepos.name));

  const urlsByProject = new Map<string, string[]>();
  for (const link of links) {
    const urls = urlsByProject.get(link.projectId) ?? [];
    urls.push(
      `https://github.com/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.name)}`,
    );
    urlsByProject.set(link.projectId, urls);
  }

  return rows.map((row) => ({
    ...row,
    contributionMode: mode(row.contributionMode),
    githubUrls: urlsByProject.get(row.id) ?? [],
  }));
}

/**
 * The active Projects an officer has put in the app switcher, in display order.
 *
 * The switcher answers "where can I go", where the homepage answers "what can I
 * join", so it carries its own blurb and destination rather than reusing the
 * card's, and a Project can be wide open to contributions with nothing to visit
 * yet. Its pill is the Project's `showcaseLabel`, except on the tile that
 * leads to this site's own front door, which says where you are standing.
 */
export async function getSwitcherProjects(): Promise<SwitcherProject[]> {
  "use cache";
  cacheLife(SHOWCASE_LIFE);
  cacheTag(SHOWCASE_TAG);

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      blurb: projects.switcherBlurb,
      url: projects.switcherUrl,
      iconKey: projects.iconKey,
      colorKey: projects.colorKey,
      showcaseLabel: projects.showcaseLabel,
    })
    .from(projects)
    .where(and(eq(projects.status, "active"), eq(projects.inSwitcher, true)))
    .orderBy(asc(projects.displayOrder), asc(projects.id));

  return rows.map(({ showcaseLabel, ...row }) => ({
    ...row,
    badge: row.url === HERE_URL ? HERE_BADGE : showcaseLabel,
  }));
}
