"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  isEmojiOnly,
  parseDiscordMarkdown,
  type BlockNode,
  type InlineNode,
  type TimestampStyle,
} from "~/lib/support/discordMarkdown";
import { cn } from "~/lib/cn";

interface Role {
  name: string;
  color: string | null;
}

export interface DiscordMarkdownProps {
  content: string;
  /** Display names for `<@id>` mentions, keyed by user id (from the message payload). */
  users: Record<string, string>;
  /** Names and colors for `<@&id>` mentions, keyed by role id (from the synced roles). */
  roles: Record<string, Role>;
  /**
   * Called for a mention this render pass can't resolve on its own: an
   * unlinked user, a role the widget wasn't handed, or any channel (channel
   * names never come down the wire -- see `SupportThread`'s comment on why).
   * The parent knows what to do about it (sign in, link Discord, open the
   * thread on Discord); absent a handler, a muted pill stands in.
   */
  renderUnresolved?: (
    kind: "channel" | "role" | "user",
    id: string,
  ) => ReactNode;
}

/**
 * Renders a Discord message's raw `content` in the support widget. Parses
 * with `discordMarkdown.ts` and walks the resulting AST straight into React
 * elements -- never through `dangerouslySetInnerHTML`, since this string
 * comes from a Discord member (or a guest posting into the thread) rather
 * than app-authored copy.
 */
export default function DiscordMarkdown({
  content,
  users,
  roles,
  renderUnresolved,
}: DiscordMarkdownProps) {
  const blocks = useMemo(() => parseDiscordMarkdown(content), [content]);
  const jumbo = useMemo(() => isEmojiOnly(content), [content]);
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {blocks.map((block, index) => (
        <Block
          key={index}
          block={block}
          ctx={{ users, roles, renderUnresolved, jumbo }}
        />
      ))}
    </div>
  );
}

interface RenderCtx {
  users: Record<string, string>;
  roles: Record<string, Role>;
  renderUnresolved?: (
    kind: "channel" | "role" | "user",
    id: string,
  ) => ReactNode;
  /** Whether the whole message qualifies for Discord's oversized "jumbo" emoji treatment. */
  jumbo: boolean;
}

function Block({ block, ctx }: { block: BlockNode; ctx: RenderCtx }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <Inline nodes={block.children} ctx={ctx} />
        </p>
      );
    case "heading": {
      const tags = { 1: "h1", 2: "h2", 3: "h3" } as const;
      const Tag = tags[block.depth];
      const sizeClass =
        block.depth === 1
          ? "text-base"
          : block.depth === 2
            ? "text-[0.95em]"
            : "text-[0.9em]";
      return (
        <Tag className={cn("font-semibold", sizeClass)}>
          <Inline nodes={block.children} ctx={ctx} />
        </Tag>
      );
    }
    case "subtext":
      return (
        <p className="text-muted-foreground text-xs">
          <Inline nodes={block.children} ctx={ctx} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="border-border text-muted-foreground border-l-2 pl-3">
          {block.children.map((child, index) => (
            <Block key={index} block={child} ctx={ctx} />
          ))}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre className="border-border bg-muted overflow-x-auto rounded-md border p-2 font-mono text-xs">
          <code>{block.value}</code>
        </pre>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          start={block.ordered ? block.start : undefined}
          className={cn(
            "flex flex-col gap-1 pl-5",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item, index) => (
            <li key={index}>
              {item.map((child, childIndex) => (
                <Block key={childIndex} block={child} ctx={ctx} />
              ))}
            </li>
          ))}
        </ListTag>
      );
    }
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

function Inline({ nodes, ctx }: { nodes: InlineNode[]; ctx: RenderCtx }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineOne key={index} node={node} ctx={ctx} />
      ))}
    </>
  );
}

function InlineOne({ node, ctx }: { node: InlineNode; ctx: RenderCtx }) {
  switch (node.type) {
    case "text":
      return <>{node.value}</>;
    case "break":
      return <br />;
    case "code":
      return (
        <code className="border-border bg-muted rounded-sm border px-1 py-0.5 font-mono text-[0.9em]">
          {node.value}
        </code>
      );
    case "bold":
      return (
        <strong className="font-semibold">
          <Inline nodes={node.children} ctx={ctx} />
        </strong>
      );
    case "italic":
      return (
        <em>
          <Inline nodes={node.children} ctx={ctx} />
        </em>
      );
    case "underline":
      return (
        <span className="underline">
          <Inline nodes={node.children} ctx={ctx} />
        </span>
      );
    case "strike":
      return (
        <span className="line-through">
          <Inline nodes={node.children} ctx={ctx} />
        </span>
      );
    case "spoiler":
      return <Spoiler node={node} ctx={ctx} />;
    case "link":
      return (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          <Inline nodes={node.children} ctx={ctx} />
        </a>
      );
    case "userMention": {
      const name = ctx.users[node.id];
      if (name) return <MentionPill>@{name}</MentionPill>;
      return (
        <>
          {ctx.renderUnresolved?.("user", node.id) ?? (
            <MentionPill muted>@unknown</MentionPill>
          )}
        </>
      );
    }
    case "roleMention": {
      const role = ctx.roles[node.id];
      if (role)
        return <MentionPill color={role.color}>@{role.name}</MentionPill>;
      return (
        <>
          {ctx.renderUnresolved?.("role", node.id) ?? (
            <MentionPill muted>@unknown</MentionPill>
          )}
        </>
      );
    }
    case "channelMention":
      return (
        <>
          {ctx.renderUnresolved?.("channel", node.id) ?? (
            <MentionPill muted>#channel</MentionPill>
          )}
        </>
      );
    case "slashCommand":
      return <MentionPill>/{node.name}</MentionPill>;
    case "emoji":
      return <Emoji node={node} jumbo={ctx.jumbo} />;
    case "timestamp":
      return <Timestamp unix={node.unix} style={node.style} />;
    case "everyone":
      return <MentionPill>@everyone</MentionPill>;
    case "here":
      return <MentionPill>@here</MentionPill>;
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

/** The pill mentions and slash commands share, tinted by a role color when one's known. */
function MentionPill({
  children,
  color,
  muted,
}: {
  children: ReactNode;
  color?: string | null;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-sm px-1 py-0.5 font-medium",
        muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
      )}
      style={
        color
          ? {
              color,
              backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

function Spoiler({
  node,
  ctx,
}: {
  node: Extract<InlineNode, { type: "spoiler" }>;
  ctx: RenderCtx;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={revealed}
      onClick={() => setRevealed(true)}
      className={cn(
        "rounded-sm px-1 align-baseline",
        revealed
          ? "bg-muted text-inherit"
          : "bg-foreground cursor-pointer text-transparent select-none [&_*]:invisible",
      )}
    >
      <Inline nodes={node.children} ctx={ctx} />
    </button>
  );
}

function Emoji({
  node,
  jumbo,
}: {
  node: Extract<InlineNode, { type: "emoji" }>;
  jumbo: boolean;
}) {
  const ext = node.animated ? "gif" : "webp";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Discord's CDN, not ours to optimize.
    <img
      src={`https://cdn.discordapp.com/emojis/${node.id}.${ext}?size=48`}
      alt={`:${node.name}:`}
      title={`:${node.name}:`}
      className={cn(
        "inline-block align-middle",
        jumbo ? "h-10 w-10" : "h-5 w-5",
      )}
    />
  );
}

/** Maps a Discord timestamp style letter to an `Intl.DateTimeFormat` options bag. */
function formatOptionsFor(
  style: TimestampStyle,
): Intl.DateTimeFormatOptions | null {
  switch (style) {
    case "t":
      return { timeStyle: "short" };
    case "T":
      return { timeStyle: "medium" };
    case "d":
      return { dateStyle: "short" };
    case "D":
      return { dateStyle: "long" };
    case "f":
      return { dateStyle: "long", timeStyle: "short" };
    case "F":
      return { dateStyle: "full", timeStyle: "short" };
    case "R":
      return null;
  }
}

/**
 * Formats a Unix-seconds timestamp the way Discord's `<t:...>` tokens do, in
 * the visitor's own locale and time zone via `Intl`. This only ever runs on
 * the client (the widget's data arrives after mount), so there's no
 * server/client render mismatch to worry about despite the locale-dependent
 * output.
 */
function Timestamp({ unix, style }: { unix: number; style: TimestampStyle }) {
  const date = new Date(unix * 1000);
  const iso = date.toISOString();
  if (style === "R") {
    return <time dateTime={iso}>{formatRelative(date)}</time>;
  }
  const options = formatOptionsFor(style);
  const formatted = new Intl.DateTimeFormat(
    undefined,
    options ?? undefined,
  ).format(date);
  return <time dateTime={iso}>{formatted}</time>;
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; secs: number }[] = [
  { unit: "year", secs: 31536000 },
  { unit: "month", secs: 2592000 },
  { unit: "week", secs: 604800 },
  { unit: "day", secs: 86400 },
  { unit: "hour", secs: 3600 },
  { unit: "minute", secs: 60 },
];

function formatRelative(date: Date): string {
  const diffSecs = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const { unit, secs } of RELATIVE_UNITS) {
    if (Math.abs(diffSecs) >= secs) {
      return rtf.format(Math.round(diffSecs / secs), unit);
    }
  }
  return rtf.format(Math.round(diffSecs), "second");
}
