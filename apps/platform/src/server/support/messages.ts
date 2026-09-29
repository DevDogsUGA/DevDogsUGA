import { and, eq, inArray } from "drizzle-orm";
import {
  MessageType,
  type APIEmbed,
  type APIMessage,
  type APIPartialEmoji,
} from "discord-api-types/v10";
import { db } from "~/server/db";
import {
  resolvedUserPermissions,
  roles,
  supportMessages,
} from "~/server/db/schema";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import type {
  SupportEmbed,
  SupportEmoji,
  SupportMessage,
} from "~/lib/support/types";
import type { Visitor } from "./identity";

const VIA_DOCS = / \(via docs\)$/;

/** The webhook id inside a webhook URL (`/api/webhooks/{id}/{token}`). */
export function webhookIdOf(webhookUrl: string): string | null {
  return /\/webhooks\/(\d+)\//.exec(webhookUrl)?.[1] ?? null;
}

/** Discord user ids among `authorIds` who hold a leadership role here. */
export async function officerDiscordIds(
  authorIds: string[],
): Promise<Set<string>> {
  if (authorIds.length === 0) return new Set();
  const rows = await db
    .select({ discordId: identitiesInAuth.providerId })
    .from(identitiesInAuth)
    .innerJoin(
      resolvedUserPermissions,
      eq(resolvedUserPermissions.userId, identitiesInAuth.userId),
    )
    .where(
      and(
        eq(identitiesInAuth.provider, "discord"),
        inArray(identitiesInAuth.providerId, authorIds),
        eq(resolvedUserPermissions.isLeader, true),
      ),
    );
  return new Set(rows.map((row) => row.discordId));
}

/**
 * Names for role mentions, from the roles the platform already syncs with
 * Discord. A role the platform does not sync stays an id, and the client
 * falls back for it like any other unresolved mention.
 */
export async function roleNames(
  messages: APIMessage[],
): Promise<Record<string, { name: string; color: string | null }>> {
  const ids = [
    ...new Set(
      messages.flatMap((message) =>
        [...message.content.matchAll(/<@&(\d+)>/g)].map((m) => m[1]!),
      ),
    ),
  ];
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: roles.discordRoleId, name: roles.title, color: roles.color })
    .from(roles)
    .where(inArray(roles.discordRoleId, ids));
  return Object.fromEntries(
    rows.map((row) => [row.id!, { name: row.name, color: row.color }]),
  );
}

/** Which of these message ids the visitor relayed themselves. */
async function ownMessageIds(
  messageIds: string[],
  visitor: Visitor | null,
): Promise<Set<string>> {
  if (!visitor || messageIds.length === 0) return new Set();
  const rows = await db
    .select({ id: supportMessages.messageId })
    .from(supportMessages)
    .where(
      and(
        inArray(supportMessages.messageId, messageIds),
        visitor.kind === "member"
          ? eq(supportMessages.userId, visitor.userId)
          : eq(supportMessages.guestId, visitor.guestId),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

function avatarUrl(message: APIMessage): string | null {
  const { author } = message;
  if (!author.avatar) return null;
  const ext = author.avatar.startsWith("a_") ? "gif" : "webp";
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}?size=64`;
}

function emoji(e: APIPartialEmoji): SupportEmoji {
  return { id: e.id ?? null, name: e.name ?? null, animated: e.animated ?? false };
}

function embed(e: APIEmbed): SupportEmbed {
  const media = (m: APIEmbed["image"]) =>
    m?.url
      ? { url: m.proxy_url ?? m.url, width: m.width ?? null, height: m.height ?? null }
      : null;
  return {
    url: e.url ?? null,
    title: e.title ?? null,
    description: e.description ?? null,
    color: e.color ?? null,
    authorName: e.author?.name ?? null,
    providerName: e.provider?.name ?? null,
    footer: e.footer?.text ?? null,
    thumbnail: media(e.thumbnail),
    image: media(e.image),
    fields: (e.fields ?? []).map((f) => ({
      name: f.name,
      value: f.value,
      inline: f.inline ?? false,
    })),
  };
}

function systemText(message: APIMessage): string | null {
  switch (message.type) {
    case MessageType.Default:
    case MessageType.Reply:
    case MessageType.ChatInputCommand:
    case MessageType.ContextMenuCommand:
      return null;
    case MessageType.ChannelPinnedMessage:
      return `${message.author.username} pinned a message.`;
    case MessageType.ThreadStarterMessage:
      return null;
    case MessageType.ChannelNameChange:
      return `${message.author.username} renamed the post to ${message.content}.`;
    default:
      return "";
  }
}

/**
 * REST message payloads carry no guild `member` (that is gateway-only), so a
 * server nickname is out of reach without a request per author; the global
 * display name is the closest the payload has.
 */
function authorName(message: Pick<APIMessage, "author">): string {
  const name = message.author.global_name ?? message.author.username;
  return name.replace(VIA_DOCS, "");
}

/**
 * Maps a thread's raw messages to what the widget renders. Two database
 * reads at most -- officer status for the human authors, and which relayed
 * messages are the viewer's own -- and no Discord calls.
 */
export async function toSupportMessages(
  messages: APIMessage[],
  options: {
    visitor: Visitor | null;
    webhookId: string | null;
    answerMessageId: string | null;
  },
): Promise<SupportMessage[]> {
  const humanAuthorIds = [
    ...new Set(
      messages.filter((m) => !m.webhook_id && !m.author.bot).map((m) => m.author.id),
    ),
  ];
  const [officers, mine] = await Promise.all([
    officerDiscordIds(humanAuthorIds),
    ownMessageIds(
      messages.map((m) => m.id),
      options.visitor,
    ),
  ]);

  return messages.flatMap((message): SupportMessage[] => {
    const system = systemText(message);
    // Message types with nothing worth showing (thread-created notices,
    // boosts, joins) are dropped rather than rendered blank.
    if (system === "") return [];

    const isVisitor =
      options.webhookId !== null && message.webhook_id === options.webhookId;
    const referenced = message.referenced_message;

    return [
      {
        id: message.id,
        author: {
          name: authorName(message),
          avatarUrl: avatarUrl(message),
          isOfficer: officers.has(message.author.id),
          isVisitor,
          isBot: Boolean(message.author.bot) && !isVisitor,
        },
        mine: mine.has(message.id),
        content: message.content,
        createdAt: message.timestamp,
        editedAt: message.edited_timestamp ?? null,
        system,
        attachments: message.attachments.map((a) => ({
          id: a.id,
          url: a.url,
          filename: a.filename,
          contentType: a.content_type ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
          size: a.size,
          durationSecs: a.duration_secs ?? null,
        })),
        embeds: message.embeds.map(embed),
        stickers: (message.sticker_items ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          format: s.format_type,
        })),
        reactions: (message.reactions ?? []).map((r) => ({
          emoji: emoji(r.emoji),
          count: r.count,
        })),
        reference: referenced
          ? {
              id: referenced.id,
              authorName: authorName(referenced),
              excerpt: referenced.content.slice(0, 140),
            }
          : null,
        poll: message.poll
          ? {
              question: message.poll.question.text ?? "",
              answers: message.poll.answers.map((answer) => ({
                id: answer.answer_id,
                text: answer.poll_media.text ?? "",
                emoji: answer.poll_media.emoji
                  ? emoji(answer.poll_media.emoji)
                  : null,
                count:
                  message.poll?.results?.answer_counts.find(
                    (c) => c.id === answer.answer_id,
                  )?.count ?? 0,
              })),
              finalized: message.poll.results?.is_finalized ?? false,
            }
          : null,
        users: Object.fromEntries(
          message.mentions.map((user) => [
            user.id,
            (user.global_name ?? user.username).replace(VIA_DOCS, ""),
          ]),
        ),
        isAnswer: message.id === options.answerMessageId,
      },
    ];
  });
}
