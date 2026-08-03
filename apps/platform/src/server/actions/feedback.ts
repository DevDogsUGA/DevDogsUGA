"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { feedback, feedbackTopics, profiles } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import { env } from "~/env";
import { canUserManageFeedback } from "~/server/actions/permissions";
import { PLATFORM_APP_SLUG, getAppIdBySlug } from "~/server/loaders/apps";
const submitFeedbackSchema = zfd.formData({
  type: zfd.text(
    z.enum([
      "bug_report",
      "feature_request",
      "design_feedback",
      "performance",
      "content_issue",
      "other",
    ]),
  ),
  severity: zfd.text(z.enum(["low", "medium", "high"]).optional()),
  topicId: zfd.text(z.uuid().optional()),
  title: zfd.text(z.string().min(1).max(100)),
  description: zfd.text(z.string().min(10)),
  browserMetadata: zfd.text(z.string().optional()),
});

export async function submitFeedback(
  formData: FormData,
): Promise<{ id: string }> {
  const userId = await expectSession();
  const parsed = await submitFeedbackSchema.parseAsync(formData);

  const browserMetadata = parsed.browserMetadata
    ? (JSON.parse(parsed.browserMetadata) as {
        userAgent: string;
        platform: string;
        screenWidth: number;
        screenHeight: number;
        viewportWidth: number;
        viewportHeight: number;
        url: string;
      })
    : undefined;

  const appId = await getAppIdBySlug(PLATFORM_APP_SLUG);

  if (parsed.topicId) {
    const topic = await db.query.feedbackTopics.findFirst({
      columns: { id: true },
      where: { id: parsed.topicId, appId },
    });
    if (!topic) throw new Error("Unknown feedback topic");
  }

  const [row] = await db
    .insert(feedback)
    .values({
      userId,
      // First-party feedback is no longer a special case with a null app: the
      // site is a registered app like any other, so there is one shape and one
      // code path rather than two.
      appId,
      type: parsed.type,
      // Verified against this app's own topics rather than trusted: the
      // composite foreign key on "feedback" would reject a topic belonging to
      // another app anyway, but as a constraint violation rather than as
      // something the dialog can show a user.
      topicId: parsed.topicId ?? null,
      severity: parsed.severity ?? null,
      title: parsed.title,
      description: parsed.description,
      browserMetadata: browserMetadata ?? null,
    })
    .returning({ id: feedback.id });

  return { id: row!.id };
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: "open" | "in_review" | "resolved" | "dismissed",
): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserManageFeedback(userId))) throw new Error("Unauthorized");

  await db
    .update(feedback)
    .set({ status, updatedAt: new Date() })
    .where(eq(feedback.id, feedbackId));
}

export async function updateFeedbackAdminNote(
  feedbackId: string,
  adminNote: string,
): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserManageFeedback(userId))) throw new Error("Unauthorized");

  await db
    .update(feedback)
    .set({ adminNote: adminNote || null, updatedAt: new Date() })
    .where(eq(feedback.id, feedbackId));
}

export type FeedbackDetail = {
  id: string;
  type: string;
  severity: string | null;
  topicId: string | null;
  topicLabel: string | null;
  title: string;
  description: string;
  status: string;
  browserMetadata: {
    userAgent: string;
    platform: string;
    screenWidth: number;
    screenHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    url: string;
  } | null;
  attachmentSignedUrls: { path: string; url: string }[];
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  submitterName: string;
  submitterUserId: string;
};

export async function getFeedbackDetail(
  feedbackId: string,
): Promise<FeedbackDetail> {
  const userId = await expectSession();
  if (!(await canUserManageFeedback(userId))) throw new Error("Unauthorized");

  const [row] = await db
    .select({
      id: feedback.id,
      type: feedback.type,
      severity: feedback.severity,
      topicId: feedback.topicId,
      topicLabel: feedbackTopics.label,
      title: feedback.title,
      description: feedback.description,
      status: feedback.status,
      browserMetadata: feedback.browserMetadata,
      attachmentPaths: feedback.attachmentPaths,
      adminNote: feedback.adminNote,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
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
    .where(eq(feedback.id, feedbackId));

  if (!row) throw new Error("Feedback not found");

  const attachmentSignedUrls: { path: string; url: string }[] = [];
  for (const path of row.attachmentPaths ?? []) {
    const { data } = await supabaseAdmin.storage
      .from(env.NEXT_PUBLIC_FEEDBACK_BUCKET)
      .createSignedUrl(path, 3600);
    if (data) attachmentSignedUrls.push({ path, url: data.signedUrl });
  }

  return {
    id: row.id,
    type: row.type,
    severity: row.severity ?? null,
    topicId: row.topicId ?? null,
    topicLabel: row.topicLabel ?? null,
    title: row.title,
    description: row.description,
    status: row.status,
    browserMetadata: row.browserMetadata as FeedbackDetail["browserMetadata"],
    attachmentSignedUrls,
    adminNote: row.adminNote ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submitterName: row.preferredName,
    submitterUserId: row.userId,
  };
}

export type FeedbackFilters = {
  tab: "inbox" | "archive";
  search?: string;
  type?: string;
  severity?: string;
};

export type FeedbackListItem = {
  id: string;
  type: string;
  severity: string | null;
  topicId: string | null;
  topicLabel: string | null;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  submitterName: string;
  submitterUserId: string;
};
