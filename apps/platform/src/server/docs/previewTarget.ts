import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { projects } from "~/server/db/schema";
import { rules, type Caller } from "~/server/auth/access";
import { getRelation } from "~/server/projects/load";
import { docsRepo } from "./docsProposals";
import { createDocsStore } from "./docsStore";
import { RESERVED_DOCS_SLUGS } from "./projectMap";
import { getDocsProjects } from "./queries";
import type { PreviewFacts } from "./previewAccess";

/** A project whose docs can be previewed, and who the caller is to it. */
export interface PreviewProject {
  id: string;
  slug: string;
  name: string;
  /** The numeric id of the repository the docs are read from. */
  repoId: string;
  facts: PreviewFacts;
}

/**
 * A slug the site's own docs use: those are bundled at build time and have no
 * repository to read live.
 */
export const isBundledSlug = (slug: string): boolean =>
  RESERVED_DOCS_SLUGS.has(slug) ||
  getDocsProjects().some((project) => project.slug === slug);

/**
 * The project under `slug`, the repository its docs come from (its chosen docs
 * repository, or its only linked one, approved and available), and the
 * caller's relation to it. Null when any of that is missing; the caller can't
 * tell which, on purpose (see `previewAccess.ts`).
 */
export async function resolvePreviewTarget(
  caller: Caller,
  slug: string,
): Promise<PreviewProject | null> {
  if (isBundledSlug(slug)) return null;
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      devdogsOwned: projects.devdogsOwned,
    })
    .from(projects)
    .where(eq(projects.slug, slug));
  if (!row) return null;

  const loaded = await createDocsStore().loadProject(row.id);
  if (!loaded) return null;
  const repo = docsRepo(loaded.project, loaded.repos);
  if (!repo || !repo.approved || !repo.available) return null;

  const relation = await getRelation(caller.userId, row.id);
  return {
    id: row.id,
    slug,
    name: row.name,
    repoId: repo.githubRepoId,
    facts: {
      isOwner: relation.isOwner || (row.devdogsOwned && rules.officer(caller)),
      isContributor: relation.isContributor,
      isReviewer: rules.previewDocs(caller),
    },
  };
}

/** Every project a docs reviewer can open, for the landing page. */
export async function listPreviewableProjects(): Promise<
  { slug: string; name: string }[]
> {
  const rows = await db.execute<{ slug: string; name: string }>(sql`
    select distinct p.slug, p.name
    from platform.projects p
    join platform."projectRepos" pr
      on pr."projectId" = p.id and pr.approval = 'approved'
    where p.slug is not null
    order by p.name`);
  return rows.filter((row) => !isBundledSlug(row.slug));
}
