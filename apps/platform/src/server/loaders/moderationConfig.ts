import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { apps, feedbackTopics, reportReasons } from "~/server/db/schema";
import { expectSession } from "~/server/auth";
import {
  canUserManageFeedback,
  canUserModerate,
} from "~/server/actions/permissions";

export interface AppOption {
  id: string;
  slug: string;
  displayName: string;
}

export interface ReasonRow {
  id: string;
  title: string;
  description: string | null;
}

export interface TopicRow {
  id: string;
  label: string;
}

/**
 * Every registered app, for the picker at the top of the tools pages.
 *
 * Unfiltered on purpose: the registry is the list of things DevDogs moderates,
 * and hiding an app here would only make its unconfigured reasons harder to
 * notice. `sandbox` shows up alongside the rest, which is correct -- it is a
 * registered app, and its reasons are seeded rather than set here.
 */
export const listApps = cache(async (): Promise<AppOption[]> => {
  return db
    .select({
      id: apps.id,
      slug: apps.slug,
      displayName: apps.displayName,
    })
    .from(apps)
    .orderBy(asc(apps.displayName));
});

/**
 * The app a page is configuring: the one named in `?app=`, else the first.
 *
 * `cache`d because the picker and the list below it both need it, and they are
 * separate Suspense boundaries -- without this the registry would be queried
 * once per card on every render.
 */
export const selectedApp = cache(
  async (slug: string): Promise<AppOption | undefined> => {
    const all = await listApps();
    return all.find((a) => a.slug === slug) ?? all[0];
  },
);

export async function getReportReasonsPageData(appId: string): Promise<{
  canEdit: boolean;
  reasons: ReasonRow[];
}> {
  const userId = await expectSession();

  const [canEdit, reasons] = await Promise.all([
    canUserModerate(userId),
    db
      .select({
        id: reportReasons.id,
        title: reportReasons.title,
        description: reportReasons.description,
      })
      .from(reportReasons)
      .where(eq(reportReasons.appId, appId))
      .orderBy(asc(reportReasons.createdAt)),
  ]);

  return { canEdit, reasons };
}

export async function getFeedbackTopicsPageData(appId: string): Promise<{
  canEdit: boolean;
  topics: TopicRow[];
}> {
  const userId = await expectSession();

  const [canEdit, topics] = await Promise.all([
    canUserManageFeedback(userId),
    db
      .select({ id: feedbackTopics.id, label: feedbackTopics.label })
      .from(feedbackTopics)
      .where(eq(feedbackTopics.appId, appId))
      .orderBy(asc(feedbackTopics.createdAt)),
  ]);

  return { canEdit, topics };
}
