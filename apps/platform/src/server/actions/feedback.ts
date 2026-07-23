"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { expectSession, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { feedbackTopics, profiles, siteFeedback } from '~/server/db/schema';
import { supabaseAdmin } from "~/supabase/admin";
import { env } from "~/env";
import { canUserManageFeedback } from "~/server/actions/permissions";
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

  const [row] = await db
    .insert(siteFeedback)
    .values({
      userId,
      type: parsed.type,
      severity: parsed.severity ?? null,
      title: parsed.title,
      description: parsed.description,
      browserMetadata: browserMetadata ?? null,
    })
    .returning({ id: siteFeedback.id });

  return { id: row!.id };
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: "open" | "in_review" | "resolved" | "dismissed",
): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserManageFeedback(userId))) throw new Error("Unauthorized");

  await db
    .update(siteFeedback)
    .set({ status, updatedAt: new Date() })
    .where(eq(siteFeedback.id, feedbackId));
}

export async function updateTestFeedbackStatus(
  feedbackId: string,
  status: "open" | "in_review" | "resolved" | "dismissed",
): Promise<void> {
  const caller = await expectUserWith({
    profile: {
      with: { oauthRegistration: { columns: { clientId: true } } },
    },
    testAccounts: { columns: { testUserId: true } },
  });

  const clientId = caller.profile?.oauthRegistration?.clientId;
  const testUserIds = caller.testAccounts.map((ta) => ta.testUserId);
  if (!clientId) throw new Error("Unauthorized");

  const row = await db.query.siteFeedback.findFirst({
    columns: { clientId: true, userId: true },
    where: { id: feedbackId },
  });

  if (!row || row.clientId !== clientId || !testUserIds.includes(row.userId)) {
    throw new Error("Unauthorized");
  }

  await db
    .update(siteFeedback)
    .set({ status, updatedAt: new Date() })
    .where(eq(siteFeedback.id, feedbackId));
}

export async function updateFeedbackAdminNote(
  feedbackId: string,
  adminNote: string,
): Promise<void> {
  const userId = await expectSession();
  if (!(await canUserManageFeedback(userId))) throw new Error("Unauthorized");

  await db
    .update(siteFeedback)
    .set({ adminNote: adminNote || null, updatedAt: new Date() })
    .where(eq(siteFeedback.id, feedbackId));
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
      id: siteFeedback.id,
      type: siteFeedback.type,
      severity: siteFeedback.severity,
      topicId: siteFeedback.topicId,
      topicLabel: feedbackTopics.label,
      title: siteFeedback.title,
      description: siteFeedback.description,
      status: siteFeedback.status,
      browserMetadata: siteFeedback.browserMetadata,
      attachmentPaths: siteFeedback.attachmentPaths,
      adminNote: siteFeedback.adminNote,
      createdAt: siteFeedback.createdAt,
      updatedAt: siteFeedback.updatedAt,
      userId: siteFeedback.userId,
      preferredName: profiles.preferredName,
    })
    .from(siteFeedback)
    .innerJoin(profiles, eq(profiles.userId, siteFeedback.userId))
    .leftJoin(
      feedbackTopics,
      and(
        eq(feedbackTopics.clientId, siteFeedback.clientId!),
        eq(feedbackTopics.id, siteFeedback.topicId!),
      ),
    )
    .where(eq(siteFeedback.id, feedbackId));

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
