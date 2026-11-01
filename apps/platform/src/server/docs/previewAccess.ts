import { cache } from "react";
import { notFound } from "next/navigation";
import { requireDashboard, rules, type Caller } from "~/server/auth/access";
import { resolvePreviewTarget, type PreviewProject } from "./previewTarget";

/**
 * Who may read a project's docs live, before they are published.
 *
 * The project's owners (an owner row, or an officer on a DevDogs-owned
 * project), its contributors (members with stored commits in a repository it
 * links), and the holders of `rules.previewDocs`, the docs reviewers. Nobody
 * else, and nobody who isn't signed in.
 *
 * Everyone refused gets a 404, and so does a project that doesn't exist, has no
 * repository to read, or is one of the site's own bundled docs. A card saying
 * "not allowed" would confirm that the project and its repository exist, and
 * the preview exists to read what isn't public yet.
 */
export interface PreviewFacts {
  /** An owner row, or an officer on a DevDogs-owned project. */
  isOwner: boolean;
  /** Stored commits in an approved repository of the project. */
  isContributor: boolean;
  /** `rules.previewDocs`. */
  isReviewer: boolean;
}

export const mayPreviewDocs = (facts: PreviewFacts): boolean =>
  facts.isOwner || facts.isContributor || facts.isReviewer;

/**
 * The gate on the landing page, which lists every project: only the docs
 * reviewers. A 404 for everyone else, as for the rest of the preview.
 */
export async function requireDocsPreview(): Promise<Caller> {
  const caller = await requireDashboard();
  if (!rules.previewDocs(caller)) notFound();
  return caller;
}

/**
 * The gate on one project's preview. Resolves the project and the repository
 * its docs come from and checks the caller against them; a 404 otherwise.
 */
export const requirePreviewProject = cache(
  async (
    slug: string,
  ): Promise<{ caller: Caller; project: PreviewProject }> => {
    const caller = await requireDashboard();
    const project = await resolvePreviewTarget(caller, slug);
    if (project === null || !mayPreviewDocs(project.facts)) notFound();
    return { caller, project };
  },
);
