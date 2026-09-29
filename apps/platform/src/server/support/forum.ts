import {
  AllowedMentionsTypes,
  Routes,
  type APIGuildForumChannel,
  type APIMessage,
  type APIThreadChannel,
  type RESTGetAPIChannelThreadsArchivedQuery,
  type RESTGetAPIGuildThreadsResult,
  type RESTPatchAPIChannelJSONBody,
  type RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import { DiscordAPIError } from "@discordjs/rest";
import { env } from "~/env";
import { asBot } from "~/server/discord/api";
import { SUPPORT_TAGS, type SupportConfig } from "./config";

/**
 * Everything the widget does to Discord, in one place.
 *
 * Two identities do the work. Visitor messages go through the forum's
 * webhook, because a webhook message can carry any display name and avatar
 * and the bot's cannot; that is how a visitor's words show up in the thread
 * under their own name. Everything else -- reading threads, swapping tags,
 * archiving, deleting -- is the bot, which needs View Channel, Read Message
 * History, Send Messages in Threads and Manage Threads on the forum.
 */

/** Discord's own caps. Enforced here so an overlong input fails loudly. */
export const LIMITS = {
  title: 100,
  content: 2000,
  username: 80,
} as const;

interface WebhookPost {
  content: string;
  username: string;
  avatarUrl?: string | null;
  /** Discord user ids allowed to be pinged by this message. Nobody else is. */
  pingUserIds?: string[];
}

/**
 * Executes the forum webhook. `wait=true` makes Discord return the created
 * message, whose id we record and whose `channel_id` is the thread.
 */
async function executeWebhook(
  config: SupportConfig,
  body: RESTPostAPIWebhookWithTokenJSONBody,
  threadId?: string,
): Promise<APIMessage> {
  const url = new URL(config.webhookUrl);
  url.searchParams.set("wait", "true");
  if (threadId) url.searchParams.set("thread_id", threadId);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Support webhook failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as APIMessage;
}

function webhookBody(post: WebhookPost): RESTPostAPIWebhookWithTokenJSONBody {
  return {
    content: post.content.slice(0, LIMITS.content),
    username: post.username.slice(0, LIMITS.username),
    avatar_url: post.avatarUrl ?? undefined,
    // Nothing a visitor types can ping anyone: no @everyone, no roles, no
    // users, except the ids the server itself chose to allow.
    allowed_mentions: {
      parse: [] as AllowedMentionsTypes[],
      users: post.pingUserIds ?? [],
    },
  };
}

/** Starts a forum post. The returned message id is also the thread id. */
export async function createPost(
  config: SupportConfig,
  post: WebhookPost & { title: string; tagIds: string[] },
): Promise<APIMessage> {
  return executeWebhook(config, {
    ...webhookBody(post),
    thread_name: post.title.slice(0, LIMITS.title),
    applied_tags: post.tagIds,
  });
}

/** Posts a visitor's message into an existing thread. */
export async function postReply(
  config: SupportConfig,
  threadId: string,
  post: WebhookPost,
): Promise<APIMessage> {
  return executeWebhook(config, webhookBody(post), threadId);
}

/** The thread as a channel: name, tags, archive state, last message id. */
export async function getThread(
  threadId: string,
): Promise<APIThreadChannel | null> {
  return (await asBot()
    .get(Routes.channel(threadId))
    .catch(nullOn404)) as APIThreadChannel | null;
}

/**
 * The newest `limit` messages of a thread, oldest first. One page is the
 * whole conversation for any realistic support thread; a thread past 100
 * messages shows its most recent 100 and links out for the rest.
 */
export async function getThreadMessages(
  threadId: string,
  limit = 100,
): Promise<APIMessage[]> {
  const messages = (await asBot().get(Routes.channelMessages(threadId), {
    query: new URLSearchParams({ limit: String(limit) }),
  })) as APIMessage[];
  return messages.reverse();
}

export async function getMessage(
  threadId: string,
  messageId: string,
): Promise<APIMessage | null> {
  return (await asBot()
    .get(Routes.channelMessage(threadId, messageId))
    .catch(nullOn404)) as APIMessage | null;
}

/** Applies `applied_tags` and archive state in one PATCH. */
export async function updateThread(
  threadId: string,
  patch: { tagIds?: string[]; archived?: boolean },
): Promise<void> {
  const body: RESTPatchAPIChannelJSONBody = {};
  if (patch.tagIds) body.applied_tags = patch.tagIds;
  if (patch.archived !== undefined) body.archived = patch.archived;
  await asBot().patch(Routes.channel(threadId), { body });
}

export async function deleteThread(threadId: string): Promise<void> {
  await asBot().delete(Routes.channel(threadId)).catch(nullOn404);
}

export async function deleteMessage(
  threadId: string,
  messageId: string,
): Promise<void> {
  await asBot()
    .delete(Routes.channelMessage(threadId, messageId))
    .catch(nullOn404);
}

/**
 * Every active (unarchived) thread in the guild that belongs to the forum.
 * One request covers every conversation's unread state at once, which is
 * why the launcher badge costs a single Discord call however many
 * conversations a visitor has.
 */
export async function getActiveForumThreads(
  config: SupportConfig,
): Promise<APIThreadChannel[]> {
  const result = (await asBot().get(
    Routes.guildActiveThreads(env.DISCORD_GUILD_ID),
  )) as RESTGetAPIGuildThreadsResult;
  return (result.threads as APIThreadChannel[]).filter(
    (thread) => thread.parent_id === config.forumId,
  );
}

/** One page of archived forum posts, newest archive first. */
export async function getArchivedForumThreads(
  config: SupportConfig,
  before?: string,
): Promise<{ threads: APIThreadChannel[]; hasMore: boolean }> {
  const query: RESTGetAPIChannelThreadsArchivedQuery = { limit: 100 };
  if (before) query.before = before;
  const result = (await asBot().get(
    Routes.channelThreads(config.forumId, "public"),
    { query: new URLSearchParams(query as Record<string, string>) },
  )) as { threads: APIThreadChannel[]; has_more: boolean };
  return { threads: result.threads, hasMore: result.has_more };
}

export interface ForumTags {
  /** Tag id by lowercased name. */
  byName: Map<string, string>;
  /** Tag name by id. */
  byId: Map<string, string>;
}

let tagCache: { at: number; tags: ForumTags } | undefined;
const TAG_TTL_MS = 5 * 60 * 1000;

/**
 * The forum's tags, cached per isolate for five minutes. Tags change about
 * never, and every post creation and resolve needs them.
 */
export async function getForumTags(config: SupportConfig): Promise<ForumTags> {
  if (tagCache && Date.now() - tagCache.at < TAG_TTL_MS) return tagCache.tags;
  const forum = (await asBot().get(
    Routes.channel(config.forumId),
  )) as APIGuildForumChannel;
  const tags: ForumTags = { byName: new Map(), byId: new Map() };
  for (const tag of forum.available_tags) {
    tags.byName.set(tag.name.toLowerCase(), tag.id);
    tags.byId.set(tag.id, tag.name);
  }
  tagCache = { at: Date.now(), tags };
  return tags;
}

export function tagId(tags: ForumTags, name: string): string | undefined {
  return tags.byName.get(name.toLowerCase());
}

export function tagNames(tags: ForumTags, ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const name = tags.byId.get(id);
    return name ? [name] : [];
  });
}

/**
 * Swaps a thread between Open and Resolved, keeping every other tag (project
 * tags, FAQ, Duplicate) as it was. A missing Open/Resolved tag in the forum
 * is skipped rather than fatal, so the widget still works before an officer
 * has created the tags.
 */
export function withStatusTag(
  tags: ForumTags,
  current: readonly string[],
  status: "open" | "resolved",
): string[] {
  const open = tagId(tags, SUPPORT_TAGS.open);
  const resolved = tagId(tags, SUPPORT_TAGS.resolved);
  const kept = current.filter((id) => id !== open && id !== resolved);
  const next = status === "open" ? open : resolved;
  // Discord caps a post at five tags.
  return (next ? [next, ...kept] : kept).slice(0, 5);
}

/** The forum post's URL in the Discord client. Needs membership to open. */
export function threadUrl(threadId: string): string {
  return `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${threadId}`;
}

function nullOn404(error: unknown): null {
  if (error instanceof DiscordAPIError && error.status === 404) return null;
  throw error;
}
