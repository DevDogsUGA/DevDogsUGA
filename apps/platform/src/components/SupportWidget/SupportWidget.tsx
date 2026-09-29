"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  BellRingingIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  DiscordLogoIcon,
  PaperPlaneRightIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import { cn } from "~/lib/cn";
import type {
  SupportInbox,
  SupportSuggestion,
  SupportThread,
  SupportViewer,
} from "~/lib/support/types";
import {
  useFollow,
  useInbox,
  useReply,
  useResolve,
  useStart,
  useSuggestions,
  useThread,
} from "./api";
import { gateStep, useGateHref } from "./DiscordGate";
import { OPEN_SUPPORT_EVENT } from "./events";
import Message from "./Message";
import Turnstile from "./Turnstile";

type View =
  | { name: "inbox" }
  | { name: "compose" }
  | { name: "thread"; threadId: string; justPosted?: boolean };

/** Where the launcher shows by default. Elsewhere, only Cmd-K opens it. */
function showsLauncher(pathname: string | null): boolean {
  return (
    pathname !== null &&
    (pathname === "/docs" ||
      pathname.startsWith("/docs/") ||
      pathname.startsWith("/help/"))
  );
}

/**
 * The docs support widget: a launcher in the corner of docs pages and a
 * panel over the page with three views -- the visitor's conversations, a new
 * question (with similar questions offered before it is posted), and one
 * conversation, polled while open.
 *
 * Non-modal on purpose: the visitor is usually mid-tutorial and needs to
 * read the page behind it. Escape closes it and focus returns to the
 * launcher.
 */
export default function SupportWidget({ siteKey }: { siteKey: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: "inbox" });
  const launcherVisible = showsLauncher(pathname);
  const inbox = useInbox(open || launcherVisible);
  const launcher = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, onOpen);
  }, []);

  const unread = inbox.data?.conversations.filter((c) => c.unread).length ?? 0;

  if (!launcherVisible && !open) return null;

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  return (
    <>
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-label="Get help from DevDogs"
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Escape") close();
          }}
          className="bg-popover text-popover-foreground shadow-block-outlined-lg fixed inset-x-2 bottom-2 z-50 flex max-h-[min(40rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-xl border-2 border-black sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[26rem]"
        >
          <Panel
            view={view}
            setView={setView}
            inbox={inbox.data}
            inboxError={inbox.error}
            siteKey={siteKey}
            onClose={close}
          />
        </section>
      )}
      {launcherVisible && (
        <button
          ref={launcher}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={
            open
              ? "Close help"
              : unread > 0
                ? `Get help (${unread} unread)`
                : "Get help"
          }
          onClick={() => (open ? close() : setOpen(true))}
          className={cn(
            "bg-primary text-primary-foreground shadow-block-outlined-md fixed right-4 bottom-4 z-50 flex size-14 items-center justify-center rounded-full border-2 border-black transition-transform hover:-translate-y-0.5 sm:right-6 sm:bottom-6",
            open && "max-sm:hidden",
          )}
        >
          {open ? (
            <XIcon className="size-6" weight="bold" />
          ) : (
            <ChatCircleDotsIcon className="size-7" weight="fill" />
          )}
          {!open && unread > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-black bg-rose-500 text-[0.65rem] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      )}
    </>
  );
}

function Panel({
  view,
  setView,
  inbox,
  inboxError,
  siteKey,
  onClose,
}: {
  view: View;
  setView: (view: View) => void;
  inbox: SupportInbox | undefined;
  inboxError: Error | null;
  siteKey: string | null;
  onClose: () => void;
}) {
  const viewer: SupportViewer = inbox?.viewer ?? { kind: "anonymous" };

  return (
    <>
      <header className="flex items-center gap-2 border-b-2 border-black px-3 py-2.5">
        {view.name !== "inbox" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to your questions"
            onClick={() => setView({ name: "inbox" })}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {view.name === "compose" ? "Ask a question" : "DevDogs help"}
          </h2>
          <p className="text-muted-foreground text-xs">
            Officers usually reply within a few hours.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close help"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </header>

      {view.name === "inbox" && (
        <InboxView
          inbox={inbox}
          error={inboxError}
          onOpen={(threadId) => setView({ name: "thread", threadId })}
          onCompose={() => setView({ name: "compose" })}
        />
      )}
      {view.name === "compose" && (
        <ComposeView
          viewer={viewer}
          guestsEnabled={inbox?.guestsEnabled ?? false}
          siteKey={siteKey}
          onPosted={(threadId) =>
            setView({ name: "thread", threadId, justPosted: true })
          }
        />
      )}
      {view.name === "thread" && (
        <ThreadView
          key={view.threadId}
          threadId={view.threadId}
          viewer={viewer}
          justPosted={view.justPosted ?? false}
          onOpenThread={(threadId) => setView({ name: "thread", threadId })}
        />
      )}
    </>
  );
}

function InboxView({
  inbox,
  error,
  onOpen,
  onCompose,
}: {
  inbox: SupportInbox | undefined;
  error: Error | null;
  onOpen: (threadId: string) => void;
  onCompose: () => void;
}) {
  const conversations = inbox?.conversations ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && <p className="text-destructive text-sm">{error.message}</p>}
        {!inbox && !error && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {inbox && conversations.length === 0 && (
          <div className="flex flex-col gap-2 py-6 text-center">
            <ChatCircleDotsIcon className="text-muted-foreground mx-auto size-10" />
            <p className="text-sm font-medium">Stuck on something?</p>
            <p className="text-muted-foreground text-sm">
              Ask here and it goes to the officers in the DevDogs Discord&apos;s
              #tech-support forum. Replies show up right here.
            </p>
          </div>
        )}
        {conversations.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {conversations.map((conversation) => (
              <li key={conversation.threadId}>
                <button
                  type="button"
                  onClick={() => onOpen(conversation.threadId)}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        conversation.unread && "font-semibold",
                      )}
                    >
                      {conversation.title}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {conversation.status === "resolved" ? "Resolved" : "Open"}
                      {conversation.role === "follower" && " · Following"}
                    </span>
                  </span>
                  {conversation.unread && (
                    <span className="size-2 shrink-0 rounded-full bg-rose-500">
                      <span className="sr-only">Unread replies</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t p-3">
        <Button className="w-full" onClick={onCompose}>
          <PlusIcon /> Ask a question
        </Button>
      </div>
    </div>
  );
}

function SuggestionList({
  suggestions,
  onFollow,
  following,
}: {
  suggestions: SupportSuggestion[];
  onFollow: (threadId: string) => void;
  following: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold">Similar questions</p>
      <ul className="flex flex-col gap-1.5">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.url}
            className="bg-muted/40 flex flex-col gap-1 rounded-lg border px-3 py-2"
          >
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-[0.65rem] font-semibold uppercase">
                {suggestion.kind === "doc"
                  ? "Docs"
                  : suggestion.hasAnswer
                    ? "Answered"
                    : suggestion.status === "resolved"
                      ? "Resolved"
                      : "Open"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {suggestion.title}
              </span>
            </span>
            <span
              className="text-muted-foreground line-clamp-2 text-xs [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-current"
              // Server-built: HTML-escaped before the <mark> swap.
              dangerouslySetInnerHTML={{ __html: suggestion.snippet }}
            />
            <span className="flex gap-3 text-xs">
              {(suggestion.kind === "doc" || suggestion.hasAnswer) && (
                <a
                  href={suggestion.url}
                  className="text-primary font-medium hover:underline"
                >
                  {suggestion.kind === "doc"
                    ? "Read the page"
                    : "See the answer"}
                </a>
              )}
              {suggestion.kind === "forum" &&
                suggestion.status === "open" &&
                suggestion.threadId && (
                  <button
                    type="button"
                    disabled={following !== null}
                    onClick={() => onFollow(suggestion.threadId!)}
                    className="text-primary font-medium hover:underline disabled:opacity-50"
                  >
                    {following === suggestion.threadId
                      ? "Following…"
                      : "Same question — follow it"}
                  </button>
                )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComposeView({
  viewer,
  guestsEnabled,
  siteKey,
  onPosted,
}: {
  viewer: SupportViewer;
  guestsEnabled: boolean;
  siteKey: string | null;
  onPosted: (threadId: string) => void;
}) {
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const start = useStart();
  const follow = useFollow();
  const query = useDeferredValue(`${title} ${body}`.trim().slice(0, 200));
  const suggestions = useSuggestions(query);
  const signInHref = `/support/sign-in?next=${encodeURIComponent(pathname ?? "/docs")}`;

  const needsGuestCheck = viewer.kind === "anonymous";
  const canPostAsGuest = guestsEnabled && siteKey !== null;
  if (needsGuestCheck && !canPostAsGuest) {
    return (
      <div className="flex flex-col gap-3 p-4 text-sm">
        <p>Sign in with your UGA account to ask a question.</p>
        <Button asChild>
          <a href={signInHref}>Sign in</a>
        </Button>
        <a
          href="/discord"
          className="text-primary text-center text-xs hover:underline"
        >
          Or ask in the Discord server directly
        </a>
      </div>
    );
  }

  const ready =
    title.trim().length >= 4 &&
    body.trim().length > 0 &&
    (!needsGuestCheck || token !== null);
  const error = start.error ?? follow.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || start.isPending) return;
    start.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        page: pathname
          ? { path: pathname, title: document.title.split(" | ")[0] ?? "" }
          : null,
        turnstileToken: token ?? undefined,
      },
      { onSuccess: ({ threadId }) => onPosted(threadId) },
    );
  };

  const onFollow = (threadId: string) => {
    if (needsGuestCheck && !token) return;
    setFollowing(threadId);
    follow.mutate(
      { threadId, turnstileToken: token ?? undefined },
      {
        onSuccess: () => onPosted(threadId),
        onSettled: () => setFollowing(null),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Title
          <Input
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Supabase start fails with a port error"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          What&apos;s going on?
          <Textarea
            value={body}
            maxLength={1800}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What you tried, what happened, and any error text. Wrap code in ``` fences."
            className="max-h-48 min-h-24"
          />
        </label>
        {suggestions.data && suggestions.data.length > 0 && (
          <SuggestionList
            suggestions={suggestions.data}
            onFollow={onFollow}
            following={following}
          />
        )}
        {needsGuestCheck && siteKey && (
          <div className="flex flex-col gap-1">
            <Turnstile siteKey={siteKey} onToken={setToken} />
            <p className="text-muted-foreground text-xs">
              Asking as a guest.{" "}
              <a href={signInHref} className="text-primary hover:underline">
                Sign in
              </a>{" "}
              to keep your questions on your account.
            </p>
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Your question is posted in the DevDogs Discord, where members can see
          it.
        </p>
        {error && <p className="text-destructive text-sm">{error.message}</p>}
      </div>
      <div className="border-t p-3">
        <Button
          type="submit"
          className="w-full"
          disabled={!ready || start.isPending}
        >
          <PaperPlaneRightIcon />{" "}
          {start.isPending ? "Posting…" : "Post question"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The one nudge, shown right after posting, when the visitor has a reason to
 * care: linking Discord is what gets them pinged on a reply. For a guest the
 * same link signs them in first (see /support/link-discord).
 */
function NotifyNudge() {
  const pathname = usePathname() ?? "/docs";
  return (
    <div className="bg-primary/10 mx-3 mt-3 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <BellRingingIcon className="text-primary size-5 shrink-0" weight="fill" />
      <p className="min-w-0 flex-1">
        Posted! Get notified when someone responds.
      </p>
      <Button size="sm" asChild>
        <a href={`/support/link-discord?next=${encodeURIComponent(pathname)}`}>
          <DiscordLogoIcon /> Link Discord
        </a>
      </Button>
    </div>
  );
}

function ThreadView({
  threadId,
  viewer,
  justPosted,
  onOpenThread,
}: {
  threadId: string;
  viewer: SupportViewer;
  justPosted: boolean;
  onOpenThread: (threadId: string) => void;
}) {
  const thread = useThread(threadId);
  const reply = useReply(threadId);
  const resolve = useResolve(threadId);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;

  // Stick to the bottom as messages arrive, the way every chat does.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  if (thread.error && !thread.data) {
    return (
      <p className="text-destructive p-4 text-sm">{thread.error.message}</p>
    );
  }
  if (!thread.data) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>;
  }
  const data: SupportThread = thread.data;

  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || reply.isPending) return;
    reply.mutate(body, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {data.title}
        </p>
        <DiscordLink viewer={viewer} discordUrl={data.discordUrl} />
      </div>
      {justPosted && gateStep(viewer) !== "view-in-discord" && <NotifyNudge />}
      {data.duplicateOf && (
        <div className="mx-3 mt-3 rounded-lg border bg-amber-500/10 px-3 py-2 text-sm">
          An officer marked this as a duplicate.{" "}
          <button
            type="button"
            className="text-primary font-medium hover:underline"
            onClick={() => onOpenThread(data.duplicateOf!.threadId)}
          >
            {data.duplicateOf.title
              ? `See “${data.duplicateOf.title}”`
              : "See the original"}
          </button>
        </div>
      )}
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto pb-3"
        aria-live="polite"
      >
        {data.truncated && (
          <p className="text-muted-foreground px-3 pt-3 text-center text-xs">
            Showing the latest 100 messages.
          </p>
        )}
        {data.messages.map((message, i) => {
          const previous = data.messages[i - 1];
          const grouped =
            previous?.system === null &&
            previous.author.name === message.author.name &&
            new Date(message.createdAt).getTime() -
              new Date(previous.createdAt).getTime() <
              5 * 60 * 1000;
          return (
            <Message
              key={message.id}
              message={message}
              thread={data}
              viewer={viewer}
              grouped={grouped}
            />
          );
        })}
      </div>
      {data.status === "resolved" && (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 border-t px-3 py-2 text-xs">
          <CheckCircleIcon className="size-4 text-emerald-400" weight="fill" />
          Resolved. Reply to reopen it.
        </p>
      )}
      <form onSubmit={send} className="flex flex-col gap-2 border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Reply…"
            aria-label="Reply"
            className="max-h-32 min-h-10 flex-1"
          />
          <Button
            type="submit"
            size="icon-lg"
            aria-label="Send"
            disabled={!draft.trim() || reply.isPending}
          >
            <PaperPlaneRightIcon />
          </Button>
        </div>
        {(reply.error ?? resolve.error) && (
          <p className="text-destructive text-xs">
            {(reply.error ?? resolve.error)!.message}
          </p>
        )}
        {data.role === "asker" && data.status === "open" && (
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate()}
            className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-2 hover:underline"
          >
            {resolve.isPending
              ? "Resolving…"
              : "My question is answered — mark resolved"}
          </button>
        )}
      </form>
    </div>
  );
}

function DiscordLink({
  viewer,
  discordUrl,
}: {
  viewer: SupportViewer;
  discordUrl: string;
}) {
  const { step, href } = useGateHref(viewer, discordUrl);
  const label =
    step === "view-in-discord"
      ? "Open in Discord"
      : step === "link-discord"
        ? "Link Discord to open"
        : "Sign in to open in Discord";
  return (
    <a
      href={href}
      target={step === "view-in-discord" ? "_blank" : undefined}
      rel={step === "view-in-discord" ? "noopener noreferrer" : undefined}
      className="text-primary flex shrink-0 items-center gap-1 text-xs font-medium hover:underline"
    >
      {label}
      <ArrowSquareOutIcon className="size-3.5" />
    </a>
  );
}
