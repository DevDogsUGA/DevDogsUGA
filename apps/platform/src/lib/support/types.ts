/**
 * The support widget's wire format, shared by the route handlers that build it
 * and the client that renders it.
 *
 * Everything here comes out of a Discord message payload the bot already
 * fetched, plus what Postgres knows (officer status, role names). Nothing in
 * it costs a second Discord request; what would (channel names, for one) is
 * left as an id for the client's fallback to handle.
 */

/**
 * The Turnstile widget's `action`, set when the widget renders and checked
 * against siteverify's echo. Both surfaces that mint a guest (asking, and
 * following a suggestion) share the one widget in the compose view.
 */
export const TURNSTILE_ACTION = "support_guest";

export type SupportStatus = "open" | "resolved";

export interface SupportAuthor {
  name: string;
  avatarUrl: string | null;
  /** Holds a leadership role on the platform, via their linked Discord. */
  isOfficer: boolean;
  /** Relayed from the widget, by this visitor or another one. */
  isVisitor: boolean;
  isBot: boolean;
}

export interface SupportAttachment {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  width: number | null;
  height: number | null;
  size: number;
  /** Voice messages: duration in seconds. */
  durationSecs: number | null;
}

export interface SupportEmbed {
  url: string | null;
  title: string | null;
  description: string | null;
  color: number | null;
  authorName: string | null;
  providerName: string | null;
  footer: string | null;
  thumbnail: {
    url: string;
    width: number | null;
    height: number | null;
  } | null;
  image: { url: string; width: number | null; height: number | null } | null;
  fields: { name: string; value: string; inline: boolean }[];
}

export interface SupportEmoji {
  /** Custom emoji id; null for a unicode emoji, whose `name` is the glyph. */
  id: string | null;
  name: string | null;
  animated: boolean;
}

export interface SupportMessage {
  id: string;
  author: SupportAuthor;
  /** Sent by the visitor reading the thread. */
  mine: boolean;
  /** Raw Discord markdown; the client renders it. */
  content: string;
  createdAt: string;
  editedAt: string | null;
  /** A system line ("pinned a message") rather than something someone said. */
  system: string | null;
  attachments: SupportAttachment[];
  embeds: SupportEmbed[];
  /** Format: 1 PNG, 2 APNG, 3 Lottie, 4 GIF. */
  stickers: { id: string; name: string; format: number }[];
  reactions: { emoji: SupportEmoji; count: number }[];
  reference: { id: string; authorName: string; excerpt: string } | null;
  poll: {
    question: string;
    answers: {
      id: number;
      text: string;
      emoji: SupportEmoji | null;
      count: number;
    }[];
    finalized: boolean;
  } | null;
  /** Display names for the `<@id>` mentions in `content`, from the payload. */
  users: Record<string, string>;
  /** The officer's "Mark as answer" pick. */
  isAnswer: boolean;
}

export interface SupportThread {
  threadId: string;
  title: string;
  status: SupportStatus;
  discordUrl: string;
  /** Tagged Duplicate by an officer, with the post they pointed at. */
  duplicateOf: { threadId: string; title: string | null } | null;
  /** Names and colors for `<@&id>` role mentions, from the synced roles. */
  roles: Record<string, { name: string; color: string | null }>;
  messages: SupportMessage[];
  /** More than one page of history exists; the rest is in Discord. */
  truncated: boolean;
  role: "asker" | "follower";
}

export interface SupportConversationSummary {
  threadId: string;
  title: string;
  status: SupportStatus;
  unread: boolean;
  role: "asker" | "follower";
  createdAt: string;
}

export type SupportViewer =
  | { kind: "anonymous" }
  | { kind: "guest"; label: string }
  | { kind: "member"; name: string; discordLinked: boolean };

export interface SupportInbox {
  viewer: SupportViewer;
  conversations: SupportConversationSummary[];
  guestsEnabled: boolean;
}

/** A forum post that might already cover the visitor's question. */
export interface SupportQuestionSuggestion {
  threadId: string;
  title: string;
  status: SupportStatus;
  hasAnswer: boolean;
  /** Published at `/help/<threadId>`. */
  isFaq: boolean;
  /** Project, stack and platform tags; status tags are left out. */
  tags: string[];
  /** Anonymized Discord markdown, cut short. */
  question: string;
  /** The marked answer, likewise; FAQ posts only. */
  answer: string | null;
  /** Pre-escaped HTML with <mark> highlights. */
  snippet: string;
}

export interface SupportDocSuggestion {
  title: string;
  description: string | null;
  breadcrumbs: string[];
  /** Pre-escaped HTML with <mark> highlights. */
  snippet: string;
  url: string;
}

/** What `/support/suggest` finds while the visitor types. */
export interface SupportSuggestions {
  questions: SupportQuestionSuggestion[];
  docs: SupportDocSuggestion[];
}
