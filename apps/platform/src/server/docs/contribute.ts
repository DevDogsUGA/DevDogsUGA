import "server-only";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { db } from "~/server/db";
import { projects } from "~/server/db/schema";
import { SHOWCASE_TAG } from "~/server/projects/showcase";

/**
 * The Projects the Contribute menu lists, from the database.
 *
 * Contribute is project-authored documentation (Q36): a Project is on it when
 * its docs have published (`docsFirstPublishedAt`), plus the platform, whose
 * contributor docs are bundled with the site and so were never "published". The
 * menu's labels and marks are the Project's own name and showcase fields, never
 * a map in the code.
 *
 * The read sits under the site layout like the footer and the app switcher, so
 * it shares their cache: tagged with the showcase (an officer's edit to a
 * name, an icon or a color refreshes both) and with its own tag, which the docs
 * reconciliation raises when a project first publishes. The long lifetime is
 * only the backstop for what never raises a tag; a short one would pull every
 * page's cache down with it.
 */

const CONTRIBUTE_TAG = "contribute-menu";

/** The seeded platform project's slug, and the docs folder bundled for it. */
export const PLATFORM_SLUG = "platform";

const CONTRIBUTE_LIFE = {
  stale: 300,
  revalidate: 86_400,
  expire: 604_800,
} as const;

/** Marks the menu stale after a project first publishes its docs. */
export function revalidateContributeMenu(): void {
  revalidateTag(CONTRIBUTE_TAG, "max");
}

/** A Project as the Contribute menu reads it. */
export interface ContributeProject {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  iconKey: string | null;
  colorKey: string | null;
}

/**
 * The platform, then every other Project whose docs have published, in display
 * order. Never throws for an empty table: a database without the seeded
 * platform row simply has nothing to list.
 */
export async function getContributeProjects(): Promise<ContributeProject[]> {
  "use cache";
  cacheLife(CONTRIBUTE_LIFE);
  cacheTag(SHOWCASE_TAG, CONTRIBUTE_TAG);

  const rows = await db
    .select({
      slug: projects.slug,
      name: projects.name,
      tagline: projects.tagline,
      description: projects.description,
      iconKey: projects.iconKey,
      colorKey: projects.colorKey,
    })
    .from(projects)
    .where(
      and(
        isNotNull(projects.slug),
        or(
          eq(projects.slug, PLATFORM_SLUG),
          isNotNull(projects.docsFirstPublishedAt),
        ),
      ),
    )
    .orderBy(asc(projects.displayOrder), asc(projects.name), asc(projects.id));

  const listed = rows.flatMap(({ slug, ...row }) =>
    slug === null ? [] : [{ slug, ...row }],
  );
  // The platform leads, wherever the display order would put it.
  return [
    ...listed.filter((project) => project.slug === PLATFORM_SLUG),
    ...listed.filter((project) => project.slug !== PLATFORM_SLUG),
  ];
}
