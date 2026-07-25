import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import { canUserManageFeedback } from "~/server/actions/permissions";
import type {
  FeedbackFilters,
  FeedbackListItem,
} from "~/server/actions/feedback";
import { expectSession, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { feedbackTopics, profiles, siteFeedback } from "~/server/db/schema";

export const getFeedbackPageData = cache(async (filters: FeedbackFilters) => {
  const userId = await expectSession().catch(() => redirect("/auth"));
  const canManage = await canUserManageFeedback(userId);
  if (!canManage) redirect("/");

  type FeedbackStatus = "open" | "in_review" | "resolved" | "dismissed";
  type FeedbackType = typeof siteFeedback.type._.data;
  type FeedbackSeverity = Exclude<
    typeof siteFeedback.severity._.data,
    undefined
  >;

  const inboxStatuses: FeedbackStatus[] = ["open", "in_review"];
  const archiveStatuses: FeedbackStatus[] = ["resolved", "dismissed"];
  const activeStatuses =
    filters.tab === "inbox" ? inboxStatuses : archiveStatuses;

  const conditions = [inArray(siteFeedback.status, activeStatuses)];

  if (filters.type) {
    conditions.push(eq(siteFeedback.type, filters.type as FeedbackType));
  }
  if (filters.severity) {
    conditions.push(
      eq(siteFeedback.severity, filters.severity as FeedbackSeverity),
    );
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(siteFeedback.title, `%${filters.search}%`),
        ilike(siteFeedback.description, `%${filters.search}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: siteFeedback.id,
      type: siteFeedback.type,
      severity: siteFeedback.severity,
      topicId: siteFeedback.topicId,
      topicLabel: feedbackTopics.label,
      title: siteFeedback.title,
      description: siteFeedback.description,
      status: siteFeedback.status,
      createdAt: siteFeedback.createdAt,
      userId: siteFeedback.userId,
      preferredName: profiles.preferredName,
    })
    .from(siteFeedback)
    .innerJoin(profiles, eq(profiles.userId, siteFeedback.userId))
    .leftJoin(
      feedbackTopics,
      and(
        eq(feedbackTopics.clientId, siteFeedback.clientId),
        eq(feedbackTopics.id, siteFeedback.topicId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(siteFeedback.createdAt));

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

export type FeedbackTopicItem = { id: string; label: string };

export const getFeedbackTestingPageData = cache(async () => {
  const { profile, githubIdentity, testAccounts } = await expectUserWith({
    profile: {
      with: {
        oauthRegistration: {
          columns: { clientId: true },
          with: { feedbackTopics: true },
        },
      },
    },
    githubIdentity: { columns: { id: true } },
    testAccounts: {
      columns: { createdAt: true },
      with: {
        user: { columns: { id: true, rawUserMetaData: true } },
      },
      orderBy: { createdAt: "asc" },
    },
  }).catch(() => redirect("/auth"));

  const clientId = profile?.oauthRegistration?.clientId ?? null;
  const hasGithub = githubIdentity !== null;
  const topics: FeedbackTopicItem[] = (
    profile?.oauthRegistration?.feedbackTopics ?? []
  ).map((t) => ({ id: t.id, label: t.label }));

  let testFeedback: FeedbackListItem[] = [];
  if (clientId && testAccounts.length > 0) {
    const testUserIds = testAccounts.map((ta) => ta.user.id);

    const displayNames: Record<string, string> = {};
    for (const ta of testAccounts) {
      const meta = ta.user.rawUserMetaData;
      displayNames[ta.user.id] =
        meta &&
        typeof meta === "object" &&
        "display_name" in meta &&
        typeof meta.display_name === "string"
          ? meta.display_name
          : "Test User";
    }

    const rows = await db
      .select({
        id: siteFeedback.id,
        type: siteFeedback.type,
        severity: siteFeedback.severity,
        topicId: siteFeedback.topicId,
        topicLabel: feedbackTopics.label,
        title: siteFeedback.title,
        description: siteFeedback.description,
        status: siteFeedback.status,
        createdAt: siteFeedback.createdAt,
        userId: siteFeedback.userId,
      })
      .from(siteFeedback)
      .leftJoin(
        feedbackTopics,
        and(
          eq(feedbackTopics.clientId, siteFeedback.clientId),
          eq(feedbackTopics.id, siteFeedback.topicId),
        ),
      )
      .where(
        and(
          eq(siteFeedback.clientId, clientId),
          inArray(siteFeedback.userId, testUserIds),
        ),
      )
      .orderBy(desc(siteFeedback.createdAt));

    testFeedback = rows.map((r) => ({
      id: r.id,
      type: r.type,
      severity: r.severity ?? null,
      topicId: r.topicId ?? null,
      topicLabel: r.topicLabel ?? null,
      title: r.title,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      submitterName: displayNames[r.userId] ?? "Test User",
      submitterUserId: r.userId,
    }));
  }

  return { clientId, hasGithub, topics, testFeedback };
});
