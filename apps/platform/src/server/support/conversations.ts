import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Routes, type APIThreadChannel } from "discord-api-types/v10";
import { env } from "~/env";
import { asBot } from "~/server/discord/api";
import { db } from "~/server/db";
import {
  supportConversations,
  supportForumPosts,
  supportMessages,
} from "~/server/db/schema";
import { getDocsProjects } from "~/server/docs/queries";
import type {
  SupportConversationSummary,
  SupportInbox,
  SupportStatus,
  SupportThread,
} from "~/lib/support/types";
import { CONTEXT_LINE_PREFIX } from "./anonymize";
import { SUPPORT_TAGS, guestsEnabled, type SupportConfig } from "./config";
import {
  createPost,
  getActiveForumThreads,
  getForumTags,
  getThread,
  getThreadForRead,
  getThreadMessages,
  invalidateForumSnapshot,
  postReply,
  tagId,
  tagNames,
  threadUrl,
  updateThread,
  withStatusTag,
  type ForumTags,
} from "./forum";
import { answerMessageIdFor, forumTitle, upsertForumPost } from "./forumIndex";
import { displayName, owner, type Visitor } from "./identity";
import { roleNames, toSupportMessages, webhookIdOf } from "./messages";

/** A failure the widget shows the visitor, with the HTTP status to send. */
export class SupportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Snowflakes are time-ordered; compare as integers, not strings. */
function newer(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return false;
  if (!b) return true;
  return BigInt(a) > BigInt(b);
}

function statusOf(
  tags: ForumTags,
  appliedTagIds: readonly string[],
): SupportStatus {
  const resolved = tagId(tags, SUPPORT_TAGS.resolved);
  return resolved && appliedTagIds.includes(resolved) ? "resolved" : "open";
}

function ownedBy(visitor: Visitor) {
  return visitor.kind === "member"
    ? eq(supportConversations.userId, visitor.userId)
    : eq(supportConversations.guestId, visitor.guestId);
}

async function conversationFor(visitor: Visitor, threadId: string) {
  const [row] = await db
    .select()
    .from(supportConversations)
    .where(and(ownedBy(visitor), eq(supportConversations.threadId, threadId)))
    .limit(1);
  if (!row) throw new SupportError(404, "Conversation not found.");
  return row;
}

function avatarOf(visitor: Visitor): string | null {
  return visitor.kind === "member"
    ? (visitor.discord?.avatarUrl ?? null)
    : null;
}

/** Pings only the visitor's own linked account, which also joins them to the thread. */
function pingIds(visitor: Visitor): string[] {
  return visitor.kind === "member" && visitor.discord
    ? [visitor.discord.id]
    : [];
}

/**
 * The visitor's conversations, newest first, with unread state. One Discord
 * request (the guild's active threads) covers all of them; archived posts
 * fall back to the index for their title and status, and cannot be unread,
 * since nobody can post in an archived thread without unarchiving it.
 */
export async function getInbox(
  config: SupportConfig,
  visitor: Visitor | null,
): Promise<SupportInbox> {
  const base = { guestsEnabled: guestsEnabled() };
  if (!visitor) {
    return { ...base, viewer: { kind: "anonymous" }, conversations: [] };
  }

  const viewer =
    visitor.kind === "member"
      ? {
          kind: "member" as const,
          name: visitor.name,
          discordLinked: visitor.discord !== null,
        }
      : { kind: "guest" as const, label: visitor.label };

  const rows = await db
    .select({
      threadId: supportConversations.threadId,
      role: supportConversations.role,
      lastReadMessageId: supportConversations.lastReadMessageId,
      followedInDiscordAt: supportConversations.followedInDiscordAt,
      createdAt: supportConversations.createdAt,
      title: supportForumPosts.title,
      isResolved: supportForumPosts.isResolved,
    })
    .from(supportConversations)
    .leftJoin(
      supportForumPosts,
      eq(supportForumPosts.threadId, supportConversations.threadId),
    )
    .where(ownedBy(visitor))
    .orderBy(desc(supportConversations.createdAt));
  if (rows.length === 0) return { ...base, viewer, conversations: [] };

  const [active, tags] = await Promise.all([
    getActiveForumThreads(config),
    getForumTags(config),
  ]);
  const activeById = new Map(active.map((thread) => [thread.id, thread]));

  if (visitor.kind === "member" && visitor.discord) {
    await followInDiscord(
      visitor.userId,
      visitor.discord.id,
      rows
        .filter(
          (row) => !row.followedInDiscordAt && activeById.has(row.threadId),
        )
        .map((row) => row.threadId),
    );
  }

  const conversations: SupportConversationSummary[] = rows.map((row) => {
    const thread = activeById.get(row.threadId);
    return {
      threadId: row.threadId,
      title: thread?.name ?? row.title ?? "Untitled",
      status: thread
        ? statusOf(tags, thread.applied_tags ?? [])
        : row.isResolved
          ? "resolved"
          : "open",
      unread: newer(thread?.last_message_id, row.lastReadMessageId),
      role: row.role as "asker" | "follower",
      createdAt: new Date(row.createdAt).toISOString(),
    };
  });

  return { ...base, viewer, conversations };
}

/**
 * Adds a member who linked Discord after asking to the threads they are in,
 * so Discord notifies them of replies from then on. Best effort: a failure
 * here leaves the row unmarked and the next inbox load tries again.
 */
async function followInDiscord(
  userId: string,
  discordUserId: string,
  threadIds: string[],
): Promise<void> {
  if (threadIds.length === 0) return;
  const results = await Promise.allSettled(
    threadIds.map((threadId) =>
      asBot().put(Routes.threadMembers(threadId, discordUserId)),
    ),
  );
  const done = threadIds.filter((_, i) => results[i]!.status === "fulfilled");
  if (done.length === 0) return;
  await db
    .update(supportConversations)
    .set({ followedInDiscordAt: sql`now()` })
    .where(
      and(
        eq(supportConversations.userId, userId),
        inArray(supportConversations.threadId, done),
        isNull(supportConversations.followedInDiscordAt),
      ),
    );
}

/** The docs project a page belongs to, for the post's project tag. */
function projectOf(path: string): { slug: string; name: string } | null {
  const slug = /^\/docs\/([^/]+)/.exec(path)?.[1];
  if (!slug) return null;
  return (
    getDocsProjects().find((p) => p.slug === decodeURIComponent(slug)) ?? null
  );
}

export interface NewConversation {
  title: string;
  body: string;
  page: { path: string; title: string } | null;
}

/**
 * Starts a forum post from the widget. The post carries Open plus the
 * project's tag (when the forum has one by that name), and one subtext line
 * of context for officers: the page it was asked from and, for a linked
 * member, a ping, which also joins them to the thread so Discord notifies
 * them of replies.
 */
export async function startConversation(
  config: SupportConfig,
  visitor: Visitor,
  input: NewConversation,
): Promise<{ threadId: string }> {
  const tags = await getForumTags(config);
  const project = input.page ? projectOf(input.page.path) : null;
  const tagIds = [
    tagId(tags, SUPPORT_TAGS.open),
    project ? tagId(tags, project.name) : undefined,
  ].filter((id): id is string => id !== undefined);

  const context: string[] = [];
  if (input.page) {
    const url = new URL(input.page.path, env.BASE_URL).toString();
    const label = input.page.title.replace(/[[\]]/g, "").slice(0, 80) || url;
    context.push(`[${label}](<${url}>)`);
  }
  if (visitor.kind === "member" && visitor.discord) {
    context.push(`<@${visitor.discord.id}>`);
  }
  const content = context.length
    ? `${input.body}\n${CONTEXT_LINE_PREFIX}${context.join(" · ")}`
    : input.body;

  const message = await createPost(config, {
    title: input.title,
    content,
    username: displayName(visitor),
    avatarUrl: avatarOf(visitor),
    pingUserIds: pingIds(visitor),
    tagIds,
  });
  const threadId = message.channel_id;
  await invalidateForumSnapshot(config);

  await db.insert(supportConversations).values({
    threadId,
    ...owner(visitor),
    role: "asker",
    lastReadMessageId: message.id,
    followedInDiscordAt:
      visitor.kind === "member" && visitor.discord ? sql`now()` : null,
  });
  await db
    .insert(supportMessages)
    .values({ messageId: message.id, threadId, ...owner(visitor) });

  // Indexed immediately so the next visitor's "similar questions" can find
  // it without waiting for the cron.
  await upsertForumPost(
    {
      id: threadId,
      name: input.title,
      applied_tags: tagIds,
      last_message_id: message.id,
    } as APIThreadChannel,
    message,
    tags,
  );

  return { threadId };
}

/** Reopens a resolved or archived post; a visitor replying means it is not done. */
async function reopenIfNeeded(
  tags: ForumTags,
  thread: APIThreadChannel,
): Promise<void> {
  const applied = thread.applied_tags ?? [];
  const archived = thread.thread_metadata?.archived ?? false;
  if (!archived && statusOf(tags, applied) === "open") return;
  await updateThread(thread.id, {
    archived: false,
    tagIds: withStatusTag(tags, applied, "open"),
  });
  await db
    .update(supportForumPosts)
    .set({ isResolved: false, updatedAt: sql`now()` })
    .where(eq(supportForumPosts.threadId, thread.id));
}

async function forumThread(
  config: SupportConfig,
  threadId: string,
): Promise<APIThreadChannel> {
  const thread = await getThread(threadId);
  if (thread?.parent_id !== config.forumId) {
    throw new SupportError(404, "That post no longer exists.");
  }
  if (thread.thread_metadata?.locked) {
    throw new SupportError(409, "Officers locked this post.");
  }
  return thread;
}

export async function reply(
  config: SupportConfig,
  visitor: Visitor,
  threadId: string,
  body: string,
): Promise<void> {
  await conversationFor(visitor, threadId);
  const [thread, tags] = await Promise.all([
    forumThread(config, threadId),
    getForumTags(config),
  ]);
  await reopenIfNeeded(tags, thread);

  const message = await postReply(config, threadId, {
    content: body,
    username: displayName(visitor),
    avatarUrl: avatarOf(visitor),
  });
  await invalidateForumSnapshot(config, threadId);
  await db
    .insert(supportMessages)
    .values({ messageId: message.id, threadId, ...owner(visitor) });
  await db
    .update(supportConversations)
    .set({ lastReadMessageId: message.id })
    .where(and(ownedBy(visitor), eq(supportConversations.threadId, threadId)));
}

/** The asker marks their own post resolved: tag swapped, thread archived. */
export async function resolve(
  config: SupportConfig,
  visitor: Visitor,
  threadId: string,
): Promise<void> {
  const conversation = await conversationFor(visitor, threadId);
  if (conversation.role !== "asker") {
    throw new SupportError(403, "Only the person who asked can resolve this.");
  }
  const [thread, tags] = await Promise.all([
    forumThread(config, threadId),
    getForumTags(config),
  ]);
  await updateThread(threadId, {
    tagIds: withStatusTag(tags, thread.applied_tags ?? [], "resolved"),
    archived: true,
  });
  await invalidateForumSnapshot(config, threadId);
  await db
    .update(supportForumPosts)
    .set({ isResolved: true, updatedAt: sql`now()` })
    .where(eq(supportForumPosts.threadId, threadId));
}

/**
 * "Me too": the visitor joins an existing post instead of starting a
 * duplicate. One relayed line tells the thread there is one more person
 * waiting, and the post shows up in the visitor's inbox from then on.
 */
export async function follow(
  config: SupportConfig,
  visitor: Visitor,
  threadId: string,
): Promise<void> {
  const [thread, tags] = await Promise.all([
    forumThread(config, threadId),
    getForumTags(config),
  ]);

  const inserted = await db
    .insert(supportConversations)
    .values({
      threadId,
      ...owner(visitor),
      role: "follower",
      lastReadMessageId: thread.last_message_id ?? null,
      followedInDiscordAt:
        visitor.kind === "member" && visitor.discord ? sql`now()` : null,
    })
    .onConflictDoNothing()
    .returning({ id: supportConversations.id });
  if (inserted.length === 0) return;

  await reopenIfNeeded(tags, thread);
  const ping = pingIds(visitor);
  const message = await postReply(config, threadId, {
    content:
      "Same question here. Following this post from the docs." +
      (ping.length ? `\n-# <@${ping[0]}>` : ""),
    username: displayName(visitor),
    avatarUrl: avatarOf(visitor),
    pingUserIds: ping,
  });
  await invalidateForumSnapshot(config, threadId);
  await db
    .insert(supportMessages)
    .values({ messageId: message.id, threadId, ...owner(visitor) });
}

/**
 * One thread as the widget renders it, and marks it read. Usually no Discord
 * request of its own: the thread comes from the shared forum snapshot, and
 * its messages are refetched only when the snapshot shows a new last
 * message (see `getActiveForumThreads`).
 */
export async function readThread(
  config: SupportConfig,
  visitor: Visitor,
  threadId: string,
): Promise<SupportThread> {
  const conversation = await conversationFor(visitor, threadId);
  const [thread, tags, answerMessageId] = await Promise.all([
    getThreadForRead(config, threadId),
    getForumTags(config),
    answerMessageIdFor(threadId),
  ]);
  if (thread?.parent_id !== config.forumId) {
    throw new SupportError(404, "That post no longer exists.");
  }
  const messages = await getThreadMessages(threadId, thread.last_message_id);

  const [rendered, roles] = await Promise.all([
    toSupportMessages(messages, {
      visitor,
      webhookId: webhookIdOf(config.webhookUrl),
      answerMessageId,
    }),
    roleNames(messages),
  ]);

  const newest = messages.at(-1)?.id;
  if (newer(newest, conversation.lastReadMessageId)) {
    await db
      .update(supportConversations)
      .set({ lastReadMessageId: newest })
      .where(eq(supportConversations.id, conversation.id));
  }

  const applied = thread.applied_tags ?? [];
  let duplicateOf: SupportThread["duplicateOf"] = null;
  if (
    tagNames(tags, applied).some(
      (name) => name.toLowerCase() === SUPPORT_TAGS.duplicate.toLowerCase(),
    )
  ) {
    const target = findLinkedThread(
      messages.filter((m) => !m.webhook_id).map((m) => m.content),
      threadId,
    );
    if (target)
      duplicateOf = { threadId: target, title: await forumTitle(target) };
  }

  return {
    threadId,
    title: thread.name ?? "Untitled",
    status: statusOf(tags, applied),
    discordUrl: threadUrl(threadId),
    duplicateOf,
    roles,
    messages: rendered,
    truncated: messages.length >= 100,
    role: conversation.role as "asker" | "follower",
  };
}

/**
 * The post an officer pointed a duplicate at: the newest link to another
 * thread in this guild, as a channel mention or a discord.com URL.
 */
export function findLinkedThread(
  contents: string[],
  selfId: string,
): string | null {
  const pattern = new RegExp(
    `<#(\\d+)>|discord(?:app)?\\.com/channels/${env.DISCORD_GUILD_ID}/(\\d+)`,
    "g",
  );
  for (const content of [...contents].reverse()) {
    const ids = [...content.matchAll(pattern)]
      .map((m) => m[1] ?? m[2])
      .filter((id): id is string => Boolean(id) && id !== selfId);
    if (ids.length > 0) return ids.at(-1)!;
  }
  return null;
}
