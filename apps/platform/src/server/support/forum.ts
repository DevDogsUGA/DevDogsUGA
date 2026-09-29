import {
  type AllowedMentionsTypes,
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
import { sharedCache } from "./sharedCache";

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

/**
 * Discord rejects a webhook username containing "discord" or "clyde" (any
 * case) with a 400, which would fail the whole post for a visitor whose name
 * happens to include either. A zero-width joiner defeats the substring check
 * without changing what anyone sees.
 */
function safeUsername(name: string): string {
  return name
    .replace(/(disc)(ord)/gi, "$1\u200d$2")
    .replace(/(cl)(yde)/gi, "$1\u200d$2")
    .slice(0, LIMITS.username);
}

function webhookBody(post: WebhookPost): RESTPostAPIWebhookWithTokenJSONBody {
  return {
    content: post.content.slice(0, LIMITS.content),
    username: safeUsername(post.username),
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
 * The newest 100 messages of a thread, oldest first. One page is the whole
 * conversation for any realistic support thread; a thread past 100 messages
 * shows its most recent 100 and links out for the rest.
 *
 * Keyed by the thread's last message id, so a poll that finds the id
 * unchanged in the snapshot costs no Discord call, and each new message
 * costs one fetch however many visitors are watching.
 */
export async function getThreadMessages(
  threadId: string,
  lastMessageId: string | null | undefined,
): Promise<APIMessage[]> {
  return sharedCache.get(
    `messages:${threadId}:${lastMessageId ?? "none"}`,
    MESSAGES_TTL_MS,
    async () => {
      const messages = (await asBot().get(Routes.channelMessages(threadId), {
        query: new URLSearchParams({ limit: "100" }),
      })) as APIMessage[];
      return messages.reverse();
    },
  );
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

/** How long every visitor shares one snapshot of the forum's active posts. */
const SNAPSHOT_TTL_MS = 5_000;
/**
 * How long a thread's messages are reused while its last message id holds
 * still. New messages change the key, so this only bounds how late edits,
 * deletions and new reactions (which leave the id alone) show up.
 */
const MESSAGES_TTL_MS = 60_000;
const TAGS_TTL_MS = 5 * 60_000;

const snapshotKey = (config: SupportConfig) => `active:${config.forumId}`;

/**
 * Every active (unarchived) post in the forum, as one snapshot shared by
 * every visitor in the data center for five seconds.
 *
 * This is the widget's change detector. One guild-wide request carries each
 * post's last message id, tags and archive state, so the inbox badge and
 * every open conversation check against the same response instead of asking
 * Discord about their thread one by one; a thread's messages are only
 * fetched again once its last message id moves (see `getThreadMessages`).
 */
export async function getActiveForumThreads(
  config: SupportConfig,
): Promise<APIThreadChannel[]> {
  return sharedCache.get(snapshotKey(config), SNAPSHOT_TTL_MS, async () => {
    const result = (await asBot().get(
      Routes.guildActiveThreads(env.DISCORD_GUILD_ID),
    )) as RESTGetAPIGuildThreadsResult;
    return (result.threads as APIThreadChannel[]).filter(
      (thread) => thread.parent_id === config.forumId,
    );
  });
}

/**
 * Makes the next read see a write this request just made: the visitor's
 * own reply, a new post, a resolve. Only this data center's copy goes;
 * elsewhere the snapshot is at most five seconds behind.
 */
export async function invalidateForumSnapshot(
  config: SupportConfig,
  threadId?: string,
): Promise<void> {
  await Promise.all([
    sharedCache.evict(snapshotKey(config)),
    threadId ? sharedCache.evict(`thread:${threadId}`) : undefined,
  ]);
}

/**
 * The thread for display: from the snapshot when it is active, otherwise
 * (archived, or created after the snapshot was taken) read directly and
 * cached a minute, since an archived post takes no new messages. Writes use
 * `getThread`, which is always fresh.
 */
export async function getThreadForRead(
  config: SupportConfig,
  threadId: string,
): Promise<APIThreadChannel | null> {
  const active = await getActiveForumThreads(config);
  const hit = active.find((thread) => thread.id === threadId);
  if (hit) return hit;
  return sharedCache.get(`thread:${threadId}`, MESSAGES_TTL_MS, () =>
    getThread(threadId),
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

/**
 * The forum's tags, cached five minutes. Tags change about never, and every
 * read and write needs them. Cached as the plain list (the shared cache
 * holds JSON) and indexed per call, which is trivial at forum-tag sizes.
 */
export async function getForumTags(config: SupportConfig): Promise<ForumTags> {
  const list = await sharedCache.get(
    `tags:${config.forumId}`,
    TAGS_TTL_MS,
    async () => {
      const forum = (await asBot().get(
        Routes.channel(config.forumId),
      )) as APIGuildForumChannel;
      return forum.available_tags.map(({ id, name }) => ({ id, name }));
    },
  );
  const tags: ForumTags = { byName: new Map(), byId: new Map() };
  for (const tag of list) {
    tags.byName.set(tag.name.toLowerCase(), tag.id);
    tags.byId.set(tag.id, tag.name);
  }
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
