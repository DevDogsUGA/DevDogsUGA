import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import { canUserManageFeedback } from "~/server/actions/permissions";
import type {
  FeedbackFilters,
  FeedbackListItem,
} from "~/server/actions/feedback";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { feedbackTopics, profiles, feedback } from "~/server/db/schema";

export const getFeedbackPageData = cache(async (filters: FeedbackFilters) => {
  const userId = await expectSession().catch(() => redirect("/auth"));
  const canManage = await canUserManageFeedback(userId);
  if (!canManage) redirect("/");

  type FeedbackStatus = "open" | "in_review" | "resolved" | "dismissed";
  type FeedbackType = typeof feedback.type._.data;
  type FeedbackSeverity = Exclude<typeof feedback.severity._.data, undefined>;

  const inboxStatuses: FeedbackStatus[] = ["open", "in_review"];
  const archiveStatuses: FeedbackStatus[] = ["resolved", "dismissed"];
  const activeStatuses =
    filters.tab === "inbox" ? inboxStatuses : archiveStatuses;

  const conditions = [inArray(feedback.status, activeStatuses)];

  if (filters.type) {
    conditions.push(eq(feedback.type, filters.type as FeedbackType));
  }
  if (filters.severity) {
    conditions.push(
      eq(feedback.severity, filters.severity as FeedbackSeverity),
    );
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(feedback.title, `%${filters.search}%`),
        ilike(feedback.description, `%${filters.search}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: feedback.id,
      type: feedback.type,
      severity: feedback.severity,
      topicId: feedback.topicId,
      topicLabel: feedbackTopics.label,
      title: feedback.title,
      description: feedback.description,
      status: feedback.status,
      createdAt: feedback.createdAt,
      userId: feedback.userId,
      preferredName: profiles.preferredName,
    })
    .from(feedback)
    .innerJoin(profiles, eq(profiles.userId, feedback.userId))
    .leftJoin(
      feedbackTopics,
      and(
        eq(feedbackTopics.appId, feedback.appId),
        eq(feedbackTopics.id, feedback.topicId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(feedback.createdAt));

  const items: FeedbackListItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    severity: r.severity ?? null,
    topicId: r.topicId ?? null,
    topicLabel: r.topicLabel ?? null,
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    submitterName: r.preferredName,
    submitterUserId: r.userId,
  }));

  return { items };
});
