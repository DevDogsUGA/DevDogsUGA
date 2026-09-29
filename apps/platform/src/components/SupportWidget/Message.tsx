"use client";

import {
  ArrowBendUpLeftIcon,
  FileIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/ssr";
import type {
  SupportAttachment,
  SupportEmbed,
  SupportEmoji,
  SupportMessage,
  SupportThread,
  SupportViewer,
} from "~/lib/support/types";
import { cn } from "~/lib/cn";
import DiscordMarkdown from "./DiscordMarkdown";
import { GatePill } from "./DiscordGate";

const CDN = "https://cdn.discordapp.com";
const MEDIA = "https://media.discordapp.net";

function emojiSrc(emoji: SupportEmoji): string | null {
  return emoji.id
    ? `${CDN}/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=48`
    : null;
}

function Emoji({
  emoji,
  className,
}: {
  emoji: SupportEmoji;
  className?: string;
}) {
  const src = emojiSrc(emoji);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- Discord's CDN, not ours to optimize.
    <img
      src={src}
      alt={`:${emoji.name ?? "emoji"}:`}
      className={cn("inline size-4", className)}
    />
  ) : (
    <span className={className}>{emoji.name}</span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Attachment({ attachment }: { attachment: SupportAttachment }) {
  const type = attachment.contentType ?? "";
  if (type.startsWith("image/")) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- Discord's CDN. */}
        <img
          src={attachment.url}
          alt={attachment.filename}
          width={attachment.width ?? undefined}
          height={attachment.height ?? undefined}
          loading="lazy"
          className="max-h-60 w-auto max-w-full rounded-md border object-contain"
        />
      </a>
    );
  }
  if (type.startsWith("video/")) {
    return (
      <video
        src={attachment.url}
        controls
        preload="metadata"
        className="max-h-60 max-w-full rounded-md border"
      />
    );
  }
  if (type.startsWith("audio/")) {
    return (
      <audio
        src={attachment.url}
        controls
        preload="metadata"
        className="w-full"
      />
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-muted hover:bg-muted/70 flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
    >
      <FileIcon className="size-5 shrink-0" />
      <span className="min-w-0 truncate font-medium">
        {attachment.filename}
      </span>
      <span className="text-muted-foreground ml-auto shrink-0">
        {formatBytes(attachment.size)}
      </span>
    </a>
  );
}

function Embed({
  embed,
  markdown,
}: {
  embed: SupportEmbed;
  markdown: (content: string) => React.ReactNode;
}) {
  const color =
    embed.color !== null
      ? `#${embed.color.toString(16).padStart(6, "0")}`
      : undefined;
  return (
    <div
      className="bg-muted/60 flex max-w-full gap-3 overflow-hidden rounded-md border-l-4 p-2.5 text-xs"
      style={{ borderLeftColor: color }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {embed.providerName && (
          <span className="text-muted-foreground">{embed.providerName}</span>
        )}
        {embed.authorName && (
          <span className="font-medium">{embed.authorName}</span>
        )}
        {embed.title &&
          (embed.url ? (
            <a
              href={embed.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="font-semibold text-sky-400 hover:underline"
            >
              {embed.title}
            </a>
          ) : (
            <span className="font-semibold">{embed.title}</span>
          ))}
        {embed.description && (
          <div className="text-muted-foreground">
            {markdown(embed.description)}
          </div>
        )}
        {embed.fields.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {embed.fields.map((field, i) => (
              <div
                key={i}
                className={field.inline ? "col-span-1" : "col-span-3"}
              >
                <div className="font-semibold">{field.name}</div>
                <div>{markdown(field.value)}</div>
              </div>
            ))}
          </div>
        )}
        {embed.image && (
          // eslint-disable-next-line @next/next/no-img-element -- Discord's media proxy.
          <img
            src={embed.image.url}
            alt=""
            loading="lazy"
            className="mt-1 max-h-48 w-auto max-w-full rounded"
          />
        )}
        {embed.footer && (
          <span className="text-muted-foreground">{embed.footer}</span>
        )}
      </div>
      {embed.thumbnail && !embed.image && (
        // eslint-disable-next-line @next/next/no-img-element -- Discord's media proxy.
        <img
          src={embed.thumbnail.url}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded object-cover"
        />
      )}
    </div>
  );
}

function Sticker({
  sticker,
  fallback,
}: {
  sticker: SupportMessage["stickers"][number];
  fallback: React.ReactNode;
}) {
  // Lottie stickers (format 3) need a Lottie player; the name stands in.
  if (sticker.format === 3) return <>{fallback}</>;
  const ext = sticker.format === 4 ? "gif" : "png";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Discord's media proxy.
    <img
      src={`${MEDIA}/stickers/${sticker.id}.${ext}?size=160`}
      alt={sticker.name}
      title={sticker.name}
      loading="lazy"
      className="size-28"
    />
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return (sameDay ? timeFormat : dateTimeFormat).format(date);
}

/**
 * One Discord message in the widget: Discord's own layout (avatar, name,
 * time, body), with the pieces Discord would add around it -- reply
 * reference above, attachments, embeds, stickers, a poll and reactions below
 * -- all from the message payload. The officer badge and the "Answer" mark
 * come from the platform, not Discord.
 */
export default function Message({
  message,
  thread,
  viewer,
  grouped,
}: {
  message: SupportMessage;
  thread: SupportThread;
  viewer: SupportViewer;
  /** Same author as the previous message, close in time: no header. */
  grouped: boolean;
}) {
  const unresolved = (kind: "channel" | "role" | "user", id: string) => (
    <GatePill
      viewer={viewer}
      discordUrl={
        kind === "channel"
          ? thread.discordUrl.replace(/\/\d+$/, `/${id}`)
          : thread.discordUrl
      }
    >
      {kind === "channel" ? "#channel" : "@unknown"}
    </GatePill>
  );
  const markdown = (content: string) => (
    <DiscordMarkdown
      content={content}
      users={message.users}
      roles={thread.roles}
      renderUnresolved={unresolved}
    />
  );

  if (message.system !== null) {
    return (
      <p className="text-muted-foreground px-3 py-1 text-center text-xs">
        {message.system}
      </p>
    );
  }

  const { author } = message;

  return (
    <article
      className={cn(
        "group flex gap-2.5 px-3",
        grouped ? "pt-0.5" : "pt-3",
        message.isAnswer &&
          "-mx-0 rounded-md bg-emerald-500/5 py-2 ring-1 ring-emerald-500/30",
      )}
    >
      <div className="w-8 shrink-0">
        {!grouped &&
          (author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Discord's CDN.
            <img
              src={author.avatarUrl}
              alt=""
              className="size-8 rounded-full"
            />
          ) : (
            <div
              aria-hidden
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                author.isVisitor
                  ? "bg-muted text-muted-foreground"
                  : "bg-indigo-500/20 text-indigo-300",
              )}
            >
              {initials(author.name)}
            </div>
          ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {message.reference && (
          <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
            <ArrowBendUpLeftIcon className="size-3 shrink-0 -scale-x-100" />
            <span className="shrink-0 font-medium">
              {message.reference.authorName}
            </span>
            <span className="truncate">
              {message.reference.excerpt || "(attachment)"}
            </span>
          </p>
        )}
        {!grouped && (
          <header className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold">
              {message.mine ? "You" : author.name}
            </span>
            {author.isOfficer && (
              <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/20 px-1 text-[0.65rem] font-semibold tracking-wide text-indigo-300 uppercase">
                <SealCheckIcon className="size-3" weight="fill" />
                Officer
              </span>
            )}
            {author.isBot && (
              <span className="bg-muted rounded px-1 text-[0.65rem] font-semibold uppercase">
                Bot
              </span>
            )}
            {message.isAnswer && (
              <span className="rounded bg-emerald-500/20 px-1 text-[0.65rem] font-semibold tracking-wide text-emerald-300 uppercase">
                Answer
              </span>
            )}
            <time
              dateTime={message.createdAt}
              className="text-muted-foreground text-xs"
            >
              {formatWhen(message.createdAt)}
            </time>
          </header>
        )}
        {message.content && (
          <div className="text-sm break-words">
            {markdown(message.content)}
            {message.editedAt && (
              <span className="text-muted-foreground ml-1 text-[0.65rem]">
                (edited)
              </span>
            )}
          </div>
        )}
        {message.attachments.map((attachment) => (
          <Attachment key={attachment.id} attachment={attachment} />
        ))}
        {message.embeds.map((embed, i) => (
          <Embed key={i} embed={embed} markdown={markdown} />
        ))}
        {message.stickers.map((sticker) => (
          <Sticker
            key={sticker.id}
            sticker={sticker}
            fallback={
              <GatePill viewer={viewer} discordUrl={thread.discordUrl}>
                Sticker: {sticker.name}
              </GatePill>
            }
          />
        ))}
        {message.poll && (
          <div className="bg-muted/60 flex flex-col gap-1.5 rounded-md border p-2.5 text-xs">
            <p className="font-semibold">{message.poll.question}</p>
            {(() => {
              const total = message.poll.answers.reduce(
                (sum, a) => sum + a.count,
                0,
              );
              return message.poll.answers.map((answer) => (
                <div
                  key={answer.id}
                  className="relative overflow-hidden rounded border px-2 py-1"
                >
                  <div
                    aria-hidden
                    className="bg-primary/15 absolute inset-y-0 left-0"
                    style={{
                      width: total ? `${(answer.count / total) * 100}%` : 0,
                    }}
                  />
                  <span className="relative flex items-center gap-1.5">
                    {answer.emoji && <Emoji emoji={answer.emoji} />}
                    {answer.text}
                    <span className="text-muted-foreground ml-auto">
                      {answer.count}
                    </span>
                  </span>
                </div>
              ));
            })()}
            <p className="text-muted-foreground">
              {message.poll.finalized ? "Poll closed" : "Vote in Discord"}
            </p>
          </div>
        )}
        {message.reactions.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Reactions">
            {message.reactions.map((reaction, i) => (
              <li
                key={i}
                className="bg-muted flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
              >
                <Emoji emoji={reaction.emoji} />
                <span className="text-muted-foreground">{reaction.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
