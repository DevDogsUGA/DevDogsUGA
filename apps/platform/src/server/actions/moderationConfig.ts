"use server";

import { and, eq } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { feedbackTopics, reportReasons } from "~/server/db/schema";
import {
  canUserManageFeedback,
  canUserModerate,
} from "~/server/actions/permissions";
import { FEEDBACK_TOPIC_TEMPLATES } from "~/server/actions/feedbackTopicsData";

/**
 * Report reasons and feedback topics, scoped to an app in `platform."apps"`.
 *
 * These used to be scoped to "your own OAuth client", which conflated two
 * questions -- which app is this, and which OAuth client signed the user in --
 * that the app registry now keeps separate. Ownership is a permission rather
 * than a registration: managing reasons is `canModerate` and managing topics is
 * `canManageFeedback`, matching the RLS policies on both tables so the server
 * path and the direct-from-browser path agree.
 *
 * Configuration is deliberately a *production* surface. The instances a
 * contributor develops against get their reasons and topics from seeds; these
 * pages are how the real ones are set, which is why they are server-rendered
 * through Drizzle rather than pointed at a nominated instance.
 */

async function expectModerator(): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserModerate(userId))) throw new Error("Unauthorized");
}

async function expectFeedbackManager(): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserManageFeedback(userId))) throw new Error("Unauthorized");
}

// ── Report reasons ───────────────────────────────────────────────────────────

export async function addReportReason(
  appId: string,
  title: string,
  description: string,
): Promise<{ id: string }> {
  await expectModerator();

  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle.length > 100) {
    throw new Error("Title must be between 1 and 100 characters");
  }

  const [row] = await db
    .insert(reportReasons)
    .values({
      appId,
      title: trimmedTitle,
      description: description.trim() || null,
    })
    .onConflictDoNothing()
    .returning({ id: reportReasons.id });

  // The unique index is on (appId, title), so a conflict means this app already
  // offers this reason -- worth saying, rather than reporting success on a
  // write that did not happen.
  if (!row) throw new Error("That reason already exists for this app");
  return { id: row.id };
}

export async function removeReportReason(
  appId: string,
  reasonId: string,
): Promise<void> {
  await expectModerator();

  // Scoped by appId as well as id so a stale form from another app cannot
  // delete a reason the operator is not looking at.
  await db
    .delete(reportReasons)
    .where(and(eq(reportReasons.id, reasonId), eq(reportReasons.appId, appId)));
}

// ── Feedback topics ──────────────────────────────────────────────────────────

export async function addFeedbackTopic(
  appId: string,
  label: string,
): Promise<{ id: string }> {
  await expectFeedbackManager();

  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 50) {
    throw new Error("Topic label must be between 1 and 50 characters");
  }

  const [row] = await db
    .insert(feedbackTopics)
    .values({ appId, label: trimmed })
    .onConflictDoNothing()
    .returning({ id: feedbackTopics.id });

  if (!row) throw new Error("That topic already exists for this app");
  return { id: row.id };
}

export async function removeFeedbackTopic(
  appId: string,
  topicId: string,
): Promise<void> {
  await expectFeedbackManager();

  await db
    .delete(feedbackTopics)
    .where(
      and(eq(feedbackTopics.id, topicId), eq(feedbackTopics.appId, appId)),
    );
}

export async function applyFeedbackTopicTemplate(
  appId: string,
  templateKey: keyof typeof FEEDBACK_TOPIC_TEMPLATES,
): Promise<void> {
  await expectFeedbackManager();

  const template = FEEDBACK_TOPIC_TEMPLATES[templateKey];
  if (!template) throw new Error("Unknown template");

  await db
    .insert(feedbackTopics)
    .values(template.topics.map((label) => ({ appId, label })))
    .onConflictDoNothing();
}
