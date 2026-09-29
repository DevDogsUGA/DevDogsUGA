-- The docs support widget: a customer-service-style chat on the docs site whose
-- conversations are posts in the Discord server's #tech-support forum.
--
-- Discord is the message store. Nothing here holds a conversation's messages;
-- the widget reads the forum thread through the bot on every open and poll.
-- These tables only hold what Discord cannot: who on the website owns a
-- thread, how far they have read, which relayed message came from whom, and
-- an anonymized search index over the forum (Discord's bot API has no forum
-- search).
--
-- All four tables are server-only, the same way `rateLimitHits` is: RLS on,
-- no permissive policy, and restrictive `no_client_*` policies closing the
-- write side that migration 00's default privileges opened. The widget's
-- route handlers reach them through drizzle as the owning role. Guests in
-- particular are NOT Supabase users (no anonymous sign-ins), so nothing about
-- them can leak through a policy granted to `authenticated`.

-- A visitor using the widget without signing in. The cookie carries a random
-- token; only its SHA-256 lands here, so a database read cannot be replayed
-- as a guest session.
create table "platform"."supportGuests" (
  "id"         uuid not null default gen_random_uuid(),
  "tokenHash"  text not null,
  -- Short label shown in Discord as `Guest 4f2a (via docs)`. Derived from
  -- the id at insert time and stored so officers see a stable name.
  "label"      text not null,
  -- Set by the "Block guest" message command. A blocked guest's token stops
  -- working on every support route.
  "blockedAt"  timestamptz,
  "createdAt"  timestamptz not null default now(),
  -- Retention clock: guests are deleted 90 days after this, and their
  -- conversations with them (the Discord posts stay).
  "lastSeenAt" timestamptz not null default now(),

  constraint "supportGuests_pkey" primary key ("id")
);

create unique index "supportGuests_tokenHash_idx"
  on "platform"."supportGuests" ("tokenHash");
create index "supportGuests_lastSeenAt_idx"
  on "platform"."supportGuests" ("lastSeenAt");

-- One row per (visitor, forum post) the visitor is part of: the asker who
-- started it, or a follower who pressed "me too" on an existing post. Owned
-- by exactly one of a member or a guest; signing in moves a guest's rows to
-- the member (see server/support/identity.ts).
create table "platform"."supportConversations" (
  "id"                uuid not null default gen_random_uuid(),
  -- The forum post's thread id. A forum post's starter message shares it.
  "threadId"          text not null,
  "userId"            uuid references auth.users ("id") on delete cascade,
  "guestId"           uuid references "platform"."supportGuests" ("id") on delete cascade,
  "role"              text not null default 'asker',
  -- Unread tracking: the newest message id the visitor has seen. Snowflakes
  -- sort by time, so "unread" is `thread.last_message_id > this`.
  "lastReadMessageId" text,
  "createdAt"         timestamptz not null default now(),

  constraint "supportConversations_pkey" primary key ("id"),
  constraint "supportConversations_owner_check"
    check (("userId" is null) <> ("guestId" is null)),
  constraint "supportConversations_role_check"
    check ("role" in ('asker', 'follower'))
);

create unique index "supportConversations_thread_user_idx"
  on "platform"."supportConversations" ("threadId", "userId")
  where "userId" is not null;
create unique index "supportConversations_thread_guest_idx"
  on "platform"."supportConversations" ("threadId", "guestId")
  where "guestId" is not null;
create index "supportConversations_userId_idx"
  on "platform"."supportConversations" ("userId");
create index "supportConversations_guestId_idx"
  on "platform"."supportConversations" ("guestId");

-- Every message the widget relayed into Discord through the webhook. Webhook
-- messages all share one author as far as Discord's API is concerned, so this
-- is how the widget tells a visitor's own messages from another visitor's in
-- the same thread, and how "Block guest" finds the guest behind a message.
create table "platform"."supportMessages" (
  "messageId" text not null,
  "threadId"  text not null,
  "userId"    uuid references auth.users ("id") on delete set null,
  "guestId"   uuid references "platform"."supportGuests" ("id") on delete set null,
  "createdAt" timestamptz not null default now(),

  constraint "supportMessages_pkey" primary key ("messageId")
);

create index "supportMessages_threadId_idx"
  on "platform"."supportMessages" ("threadId");

-- The forum search index behind the widget's "similar questions" and the
-- Cmd-K forum group. Holds every post in the forum, not just widget-started
-- ones: the index cron pulls native posts too.
--
-- Stored ANONYMIZED. The forum is members-only in Discord and this feeds a
-- public website, so the indexer strips author names and mentions before
-- anything is written, and there is no author column to leak.
create table "platform"."supportForumPosts" (
  "threadId"        text not null,
  "title"           text not null,
  "question"        text not null,
  -- Set by the "Mark as answer" message command.
  "answerMessageId" text,
  "answer"          text,
  -- Discord forum tag names applied to the post, e.g. {Open}, {Resolved,FAQ}.
  "tags"            text[] not null default '{}',
  "isResolved"      boolean not null default false,
  -- Published to Cmd-K and /help only with the FAQ tag AND a marked answer.
  "isFaq"           boolean not null default false,
  -- The thread's last message id when the indexer last read it, so a sync
  -- pass skips threads that have not moved.
  "lastMessageId"   text,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),
  -- Same 'english' configuration as docsPages, and as the websearch query in
  -- server/support/search.ts.
  "search" tsvector generated always as (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("question", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("answer", '')), 'C')
  ) stored,

  constraint "supportForumPosts_pkey" primary key ("threadId")
);

create index "supportForumPosts_search_idx"
  on "platform"."supportForumPosts" using gin ("search");

alter table "platform"."supportGuests" enable row level security;
alter table "platform"."supportConversations" enable row level security;
alter table "platform"."supportMessages" enable row level security;
alter table "platform"."supportForumPosts" enable row level security;

create policy "no_client_insert" on "platform"."supportGuests"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."supportGuests"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."supportGuests"
  as restrictive for delete to anon, authenticated using (false);

create policy "no_client_insert" on "platform"."supportConversations"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."supportConversations"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."supportConversations"
  as restrictive for delete to anon, authenticated using (false);

create policy "no_client_insert" on "platform"."supportMessages"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."supportMessages"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."supportMessages"
  as restrictive for delete to anon, authenticated using (false);

create policy "no_client_insert" on "platform"."supportForumPosts"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."supportForumPosts"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."supportForumPosts"
  as restrictive for delete to anon, authenticated using (false);
