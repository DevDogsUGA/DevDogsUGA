"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  BellRingingIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  DiscordLogoIcon,
  PaperPlaneRightIcon,
  PlusIcon,
  TagIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import { cn } from "~/lib/cn";
import {
  OS_TAGS,
  STACK_TAGS,
  isOs,
  stackOf,
  type SetupTags,
} from "~/lib/support/setup";
import type {
  SupportInbox,
  SupportThread,
  SupportViewer,
} from "~/lib/support/types";
import { useDocsVariant } from "~/components/DocsVariants/store";
import {
  pendingMessage,
  prefetchThread,
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
import { SuggestionsDialog, SuggestionsSummary } from "./SuggestionsDialog";
import Turnstile from "./Turnstile";

type View =
  | { name: "inbox" }
  | { name: "compose" }
  | {
      name: "thread";
      threadId: string;
      /** From the inbox, to show while the thread loads. */
      title?: string;
      justPosted?: boolean;
    };

/** Each docs project's platforms, to resolve which one its page is showing. */
type ProjectPlatforms = Record<string, readonly string[]>;

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
export default function SupportWidget({
  siteKey,
  projectPlatforms,
}: {
  siteKey: string | null;
  projectPlatforms: ProjectPlatforms;
}) {
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
            // Keys from the suggestions dialog bubble here through React's
            // tree though it is portaled elsewhere; its Escape is its own.
            if (!event.currentTarget.contains(event.target as Node)) return;
            if (event.key === "Escape") close();
          }}
          // Lifted off the page on purpose: the page is mauve-950, so the
          // panel is a step lighter with a lit border and a cyan block
          // shadow, the launcher's colors.
          className="text-popover-foreground shadow-block-lg fixed inset-x-2 bottom-2 z-50 flex max-h-[min(40rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-xl border-2 border-mauve-500 bg-mauve-900 shadow-cyan-400/70 sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[26rem]"
        >
          <Panel
            view={view}
            setView={setView}
            inbox={inbox.data}
            inboxError={inbox.error}
            siteKey={siteKey}
            projectPlatforms={projectPlatforms}
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
            // The site's call-to-action colors (cyan, amber shadow): the
            // one thing in the corner that should catch the eye.
            "shadow-block-md transition-lift fixed right-4 bottom-4 z-50 flex size-14 items-center justify-center rounded-full border-2 border-black bg-cyan-400 text-black shadow-amber-400 hover:-translate-x-0.5 hover:-translate-y-0.5 sm:right-6 sm:bottom-6",
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
  projectPlatforms,
  onClose,
}: {
  view: View;
  setView: (view: View) => void;
  inbox: SupportInbox | undefined;
  inboxError: Error | null;
  siteKey: string | null;
  projectPlatforms: ProjectPlatforms;
  onClose: () => void;
}) {
  const viewer: SupportViewer = inbox?.viewer ?? { kind: "anonymous" };

  return (
    <>
      <header className="flex items-center gap-2 border-b-2 border-mauve-600 bg-mauve-950/40 px-3 py-2.5">
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
          onOpen={(threadId, title) =>
            setView({ name: "thread", threadId, title })
          }
          onCompose={() => setView({ name: "compose" })}
        />
      )}
      {view.name === "compose" && (
        <ComposeView
          viewer={viewer}
          guestsEnabled={inbox?.guestsEnabled ?? false}
          siteKey={siteKey}
          projectPlatforms={projectPlatforms}
          onPosted={(threadId) =>
            setView({ name: "thread", threadId, justPosted: true })
          }
        />
      )}
      {view.name === "thread" && (
        <ThreadView
          key={view.threadId}
          threadId={view.threadId}
          title={view.title}
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
  onOpen: (threadId: string, title: string) => void;
  onCompose: () => void;
}) {
  const client = useQueryClient();
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
                  onClick={() =>
                    onOpen(conversation.threadId, conversation.title)
                  }
                  onPointerEnter={() =>
                    void prefetchThread(client, conversation.threadId)
                  }
                  onFocus={() =>
                    void prefetchThread(client, conversation.threadId)
                  }
                  className="flex w-full items-center gap-2 rounded-lg border border-mauve-700 bg-mauve-950/40 px-3 py-2 text-left hover:border-mauve-500 hover:bg-mauve-800"
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
      <div className="border-t border-mauve-700 p-3">
        <Button className="w-full" onClick={onCompose}>
          <PlusIcon /> Ask a question
        </Button>
      </div>
    </div>
  );
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const ALL_PLATFORMS = Object.keys(OS_TAGS);

/**
 * The tags a question from this page starts with: the page's stack, and the
 * platform its docs are showing (the reader's pick, or the guess from their
 * browser). Platform only on docs pages, where the reader can see it.
 */
/** The docs project a page belongs to, by slug. */
function projectOf(pathname: string): string | null {
  return /^\/docs\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

function useDetectedSetup(
  pathname: string,
  projectPlatforms: ProjectPlatforms,
): SetupTags {
  const project = projectOf(pathname);
  const offered = project ? projectPlatforms[project] : undefined;
  const os = useDocsVariant("os", offered ?? ALL_PLATFORMS);
  return {
    stack: stackOf(pathname),
    os: offered && isOs(os) ? os : null,
  };
}

/**
 * The tags a question will carry, each removable: they come from the docs
 * settings, which a reader can have left on a guess. The project's tag is
 * applied too but not listed; the page decides it, so it is never wrong.
 */
function SetupTagList({
  setup,
  onRemove,
}: {
  setup: SetupTags;
  onRemove: (group: keyof SetupTags) => void;
}) {
  const tags = [
    setup.stack && { group: "stack" as const, label: STACK_TAGS[setup.stack] },
    setup.os && { group: "os" as const, label: OS_TAGS[setup.os] },
  ].filter((tag) => tag !== null);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground flex items-center gap-1">
        <TagIcon className="size-3.5" /> Tagged
      </span>
      {tags.map((tag) => (
        <span
          key={tag.group}
          className="flex items-center gap-1 rounded-full border border-mauve-600 bg-mauve-800 py-0.5 pr-1 pl-2"
        >
          {tag.label}
          <button
            type="button"
            aria-label={`Remove the ${tag.label} tag`}
            onClick={() => onRemove(tag.group)}
            className="text-muted-foreground rounded-full p-0.5 hover:bg-mauve-700 hover:text-white"
          >
            <XIcon className="size-3" weight="bold" />
          </button>
        </span>
      ))}
    </div>
  );
}

function ComposeView({
  viewer,
  guestsEnabled,
  siteKey,
  projectPlatforms,
  onPosted,
}: {
  viewer: SupportViewer;
  guestsEnabled: boolean;
  siteKey: string | null;
  projectPlatforms: ProjectPlatforms;
  onPosted: (threadId: string) => void;
}) {
  const pathname = usePathname() ?? "/docs";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [token, setToken] = useState<string | null>(null);
  // Bumped after any guest request settles unsuccessfully: it spent the
  // single-use token, so the widget has to solve again before a retry.
  const [turnstileReset, setTurnstileReset] = useState(0);
  const spentToken = () => {
    if (token) setTurnstileReset((n) => n + 1);
  };
  const [following, setFollowing] = useState<string | null>(null);
  const [removed, setRemoved] = useState<(keyof SetupTags)[]>([]);
  const [dialogTab, setDialogTab] = useState<"questions" | "docs" | null>(null);
  const start = useStart();
  const follow = useFollow();
  // Searched once typing pauses, not per keystroke.
  const query = useDebounced(`${title} ${body}`.trim().slice(0, 200), 350);
  const suggestions = useSuggestions(query, projectOf(pathname));
  const detected = useDetectedSetup(pathname, projectPlatforms);
  const setup: SetupTags = {
    stack: removed.includes("stack") ? null : detected.stack,
    os: removed.includes("os") ? null : detected.os,
  };
  const signInHref = `/support/sign-in?next=${encodeURIComponent(pathname)}`;

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
  // Previous results are kept while the next load, but not once the query
  // is too short to search at all.
  const found = query.length >= 4 ? suggestions.data : undefined;
  const anyFound =
    found !== undefined && found.questions.length + found.docs.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || start.isPending) return;
    start.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        page: { path: pathname, title: document.title.split(" | ")[0] ?? "" },
        setup,
        turnstileToken: token ?? undefined,
      },
      {
        onSuccess: ({ threadId }) => onPosted(threadId),
        onError: spentToken,
      },
    );
  };

  const onFollow = (threadId: string) => {
    if (needsGuestCheck && !token) return;
    setFollowing(threadId);
    follow.mutate(
      { threadId, turnstileToken: token ?? undefined },
      {
        onSuccess: () => {
          setDialogTab(null);
          onPosted(threadId);
        },
        onError: spentToken,
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
        <SetupTagList
          setup={setup}
          onRemove={(group) => setRemoved((r) => [...r, group])}
        />
        {anyFound && (
          <SuggestionsSummary suggestions={found} onOpen={setDialogTab} />
        )}
        {found && (
          <SuggestionsDialog
            suggestions={found}
            tab={dialogTab}
            onTabChange={setDialogTab}
            onClose={() => setDialogTab(null)}
            onFollow={onFollow}
            following={following}
            followBlocked={
              needsGuestCheck && !token
                ? "Finish the check under the form first."
                : null
            }
          />
        )}
        {needsGuestCheck && siteKey && (
          <div className="flex flex-col gap-1">
            <Turnstile
              siteKey={siteKey}
              onToken={setToken}
              resetKey={turnstileReset}
            />
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
      <div className="border-t border-mauve-700 p-3">
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
  title,
  viewer,
  justPosted,
  onOpenThread,
}: {
  threadId: string;
  title: string | undefined;
  viewer: SupportViewer;
  justPosted: boolean;
  onOpenThread: (threadId: string) => void;
}) {
  const thread = useThread(threadId);
  const reply = useReply(threadId);
  const resolve = useResolve(threadId);
  const [draft, setDraft] = useState("");
  // When the reply being sent went out, for its pending message's time.
  const [sentAt, setSentAt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const count = (thread.data?.messages.length ?? 0) + (reply.isPending ? 1 : 0);

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
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {title && (
          <p className="truncate border-b border-mauve-700 px-3 py-2 text-sm font-medium">
            {title}
          </p>
        )}
        <div className="flex flex-col gap-3 p-3" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5">
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-mauve-800" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-mauve-800" />
                <div className="h-3 w-full animate-pulse rounded bg-mauve-800" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading the conversation…</span>
        </div>
      </div>
    );
  }
  const data: SupportThread = thread.data;
  // The reply in flight, shown at once (see `useReply`).
  const messages =
    reply.isPending && reply.variables
      ? [...data.messages, pendingMessage(reply.variables, sentAt)]
      : data.messages;

  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || reply.isPending) return;
    setSentAt(Date.now());
    setDraft("");
    // Put back what they wrote if it didn't go through.
    reply.mutate(body, { onError: () => setDraft(body) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-mauve-700 px-3 py-2">
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
        {messages.map((message, i) => {
          const previous = messages[i - 1];
          const grouped =
            previous?.system === null &&
            previous.author.name === message.author.name &&
            new Date(message.createdAt).getTime() -
              new Date(previous.createdAt).getTime() <
              5 * 60 * 1000;
          const pending = message.id === "pending";
          return (
            <div
              key={message.id}
              className={cn(pending && "opacity-60")}
              aria-busy={pending || undefined}
            >
              <Message
                message={message}
                thread={data}
                viewer={viewer}
                grouped={grouped}
              />
            </div>
          );
        })}
      </div>
      {data.status === "resolved" && (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 border-t border-mauve-700 px-3 py-2 text-xs">
          <CheckCircleIcon className="size-4 text-emerald-400" weight="fill" />
          Resolved. Reply to reopen it.
        </p>
      )}
      <form
        onSubmit={send}
        className="flex flex-col gap-2 border-t border-mauve-700 p-3"
      >
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
