import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { APIMessage, APIThreadChannel } from "discord-api-types/v10";
import { db } from "~/server/db";
import { supportForumPosts } from "~/server/db/schema";
import { anonymize } from "./anonymize";
import { SUPPORT_TAGS, type SupportConfig } from "./config";
import {
  getActiveForumThreads,
  getArchivedForumThreads,
  getForumTags,
  getMessage,
  tagNames,
  type ForumTags,
} from "./forum";

function hasTag(names: string[], tag: string): boolean {
  return names.some((name) => name.toLowerCase() === tag.toLowerCase());
}

/**
 * Writes one forum post into the index. The starter message is the question;
 * the answer column is left alone (only "Mark as answer" writes it).
 */
export async function upsertForumPost(
  thread: APIThreadChannel,
  starter: APIMessage | null,
  tags: ForumTags,
): Promise<void> {
  const names = tagNames(tags, thread.applied_tags ?? []);
  const values = {
    title: thread.name ?? "Untitled",
    question: anonymize(starter?.content ?? ""),
    tags: names,
    isResolved: hasTag(names, SUPPORT_TAGS.resolved),
    isFaq: hasTag(names, SUPPORT_TAGS.faq),
    lastMessageId: thread.last_message_id ?? null,
    updatedAt: sql`now()`,
  };
  await db
    .insert(supportForumPosts)
    .values({ threadId: thread.id, ...values })
    .onConflictDoUpdate({ target: supportForumPosts.threadId, set: values });
}

/** Records the officer-marked answer on an indexed post. */
export async function setForumAnswer(
  threadId: string,
  answer: APIMessage,
): Promise<void> {
  await db
    .update(supportForumPosts)
    .set({
      answerMessageId: answer.id,
      answer: anonymize(answer.content),
      updatedAt: sql`now()`,
    })
    .where(eq(supportForumPosts.threadId, threadId));
}

export async function answerMessageIdFor(
  threadId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: supportForumPosts.answerMessageId })
    .from(supportForumPosts)
    .where(eq(supportForumPosts.threadId, threadId))
    .limit(1);
  return row?.id ?? null;
}

async function indexedLastMessageIds(): Promise<Map<string, string | null>> {
  const rows = await db
    .select({
      threadId: supportForumPosts.threadId,
      lastMessageId: supportForumPosts.lastMessageId,
    })
    .from(supportForumPosts);
  return new Map(rows.map((row) => [row.threadId, row.lastMessageId]));
}

/**
 * Brings the index up to date with the forum. Active posts are re-read when
 * their last message moved (a tag change does not move it, so tags on an
 * unchanged post can lag until its next message -- acceptable for search,
 * and the widget reads tags live anyway). With `backfill`, every archived
 * post not yet indexed is read too, page by page; that is the launch-day
 * import and is safe to rerun.
 */
export async function syncForumIndex(
  config: SupportConfig,
  options: { backfill?: boolean } = {},
): Promise<{ indexed: number }> {
  const tags = await getForumTags(config);
  const known = await indexedLastMessageIds();
  let indexed = 0;

  const index = async (thread: APIThreadChannel, force: boolean) => {
    const seen = known.get(thread.id);
    if (!force && seen !== undefined && seen === (thread.last_message_id ?? null))
      return;
    // A forum post's starter message shares the thread's id.
    const starter = await getMessage(thread.id, thread.id);
    await upsertForumPost(thread, starter, tags);
    indexed++;
  };

  for (const thread of await getActiveForumThreads(config)) {
    await index(thread, false);
  }

  if (options.backfill) {
    let before: string | undefined;
    for (;;) {
      const page = await getArchivedForumThreads(config, before);
      for (const thread of page.threads) {
        if (!known.has(thread.id)) await index(thread, true);
      }
      if (!page.hasMore || page.threads.length === 0) break;
      before = page.threads.at(-1)?.thread_metadata?.archive_timestamp;
    }
  }

  return { indexed };
}

/** Indexed FAQ posts, for the public /help page. */
export async function getFaqPost(threadId: string) {
  const [row] = await db
    .select({
      threadId: supportForumPosts.threadId,
      title: supportForumPosts.title,
      question: supportForumPosts.question,
      answer: supportForumPosts.answer,
      updatedAt: supportForumPosts.updatedAt,
    })
    .from(supportForumPosts)
    .where(
      and(
        eq(supportForumPosts.threadId, threadId),
        eq(supportForumPosts.isFaq, true),
        isNotNull(supportForumPosts.answer),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function forumTitle(threadId: string): Promise<string | null> {
  const [row] = await db
    .select({ title: supportForumPosts.title })
    .from(supportForumPosts)
    .where(eq(supportForumPosts.threadId, threadId))
    .limit(1);
  return row?.title ?? null;
}
