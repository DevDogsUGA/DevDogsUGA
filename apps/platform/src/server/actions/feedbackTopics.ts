"use server";

import { and, eq } from "drizzle-orm";
import { expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { feedbackTopics } from '~/server/db/schema';
import { FEEDBACK_TOPIC_TEMPLATES } from "~/server/actions/feedbackTopicsData";

/**
 * Returns the caller's own OAuth client ID, or throws if they have none.
 */
async function expectOwnClientId(): Promise<string> {
  const user = await expectUserWith({
    profile: { with: { oauthRegistration: { columns: { clientId: true } } } },
  });

  const clientId = user.profile?.oauthRegistration?.clientId;
  if (!clientId) throw new Error("No OAuth client exists");
  return clientId;
}

export async function addFeedbackTopic(label: string): Promise<{ id: string }> {
  const clientId = await expectOwnClientId();

  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 50) {
    throw new Error("Topic label must be between 1 and 50 characters");
  }

  const [row] = await db
    .insert(feedbackTopics)
    .values({ clientId, label: trimmed })
    .onConflictDoNothing()
    .returning({ id: feedbackTopics.id });

  if (!row) throw new Error("Topic already exists");
  return { id: row.id };
}

export async function removeFeedbackTopic(topicId: string): Promise<void> {
  const clientId = await expectOwnClientId();

  await db
    .delete(feedbackTopics)
    .where(
      and(
        eq(feedbackTopics.id, topicId),
        eq(feedbackTopics.clientId, clientId),
      ),
    );
}

export async function applyFeedbackTopicTemplate(
  templateKey: keyof typeof FEEDBACK_TOPIC_TEMPLATES,
): Promise<void> {
  const clientId = await expectOwnClientId();

  const template = FEEDBACK_TOPIC_TEMPLATES[templateKey];
  if (!template) throw new Error("Unknown template");

  await db
    .insert(feedbackTopics)
    .values(template.topics.map((label) => ({ clientId, label })))
    .onConflictDoNothing();
}
