-- The sandbox fixture app.
--
-- A fresh instance contains no user-generated content: schedule_builder has
-- none by design, study_group_finder has nothing moderatable yet, and the forum
-- has not migrated. Without fixtures the contributor tooling opens empty and
-- unusable on day one, and the persona suite has nothing to file a report
-- against. This fills all three roles at once -- CI consumer, day-one demo, and
-- the reference implementation an integrating app copies.
--
-- Created in every tier so migrations never diverge between them, and denied
-- outright in production by a restrictive policy rather than by being absent.
--
-- The three tables cover the three shapes an app can have:
--
--   posts     -- derived: an FK to reportResolutions and nothing else
--   comments  -- derived, and a second table so cross-type behaviour is testable
--   profiles  -- declared: reportable but NOT quarantinable, because the remedy
--                for a bad profile is suspending the user, not hiding a row.
--                This is the forum's `profile` type.

create schema if not exists sandbox;

grant usage on schema sandbox to anon, authenticated, service_role;

-- ============================================================
-- Tables
-- ============================================================

create table sandbox."posts" (
  "id"            uuid not null default gen_random_uuid(),
  "authorUserId"  uuid not null,
  "title"         character varying(200) not null,
  "body"          text not null,
  -- The registration. Nothing else declares this table moderatable, and
  -- dropping this column is what un-registers it.
  --
  -- `on delete set null` un-quarantines automatically if the decision behind it
  -- is deleted, and the FK means the column carries its own provenance: "why is
  -- this hidden?" is a join rather than a guess.
  "quarantinedBy" uuid,
  "createdAt"     timestamp without time zone not null default now(),
  constraint "posts_pkey" primary key ("id")
);

create table sandbox."comments" (
  "id"            uuid not null default gen_random_uuid(),
  "postId"        uuid not null,
  "authorUserId"  uuid not null,
  "body"          text not null,
  "quarantinedBy" uuid,
  "createdAt"     timestamp without time zone not null default now(),
  constraint "comments_pkey" primary key ("id")
);

create table sandbox."profiles" (
  "id"        uuid not null default gen_random_uuid(),
  "userId"    uuid not null,
  "handle"    character varying(50) not null,
  "bio"       text,
  "createdAt" timestamp without time zone not null default now(),
  constraint "profiles_pkey" primary key ("id"),
  constraint "profiles_userId_key" unique ("userId")
);

alter table sandbox."posts"
  add constraint "posts_authorUserId_fkey"
    foreign key ("authorUserId") references auth.users("id") on delete cascade,
  add constraint "posts_quarantinedBy_fkey"
    foreign key ("quarantinedBy") references "platform"."reportResolutions"("id")
    on delete set null;

alter table sandbox."comments"
  add constraint "comments_postId_fkey"
    foreign key ("postId") references sandbox."posts"("id") on delete cascade,
  add constraint "comments_authorUserId_fkey"
    foreign key ("authorUserId") references auth.users("id") on delete cascade,
  add constraint "comments_quarantinedBy_fkey"
    foreign key ("quarantinedBy") references "platform"."reportResolutions"("id")
    on delete set null;

alter table sandbox."profiles"
  add constraint "profiles_userId_fkey"
    foreign key ("userId") references auth.users("id") on delete cascade;

-- Quarantined content is filtered out of the hot read path, so index for it.
create index "posts_visible_idx"
  on sandbox."posts" using btree ("createdAt" desc)
  where ("quarantinedBy" is null);

create index "comments_visible_idx"
  on sandbox."comments" using btree ("postId", "createdAt")
  where ("quarantinedBy" is null);

-- ============================================================
-- Grants
-- ============================================================
--
-- Deliberately NOT `alter default privileges ... grant all on tables`, which is
-- what the platform and schedule_builder schemas do.
--
-- The reason matters, because it is easy to get wrong and it fails silently.
-- Column-level privileges do not subtract from table-level ones: with a
-- table-wide UPDATE grant in place,
--
--     revoke update ("quarantinedBy") on sandbox."posts" from authenticated;
--
-- changes nothing at all -- has_column_privilege() still returns true, and a
-- client can clear its own quarantine. The grant has to be built up per column
-- instead of pared down, which is why the write grants below are explicit.
--
-- This is the only thing standing between a client and its own quarantine
-- state, since apply_content_action runs as the definer and needs no grant.

-- anon reads and never writes. RLS would refuse an anonymous insert anyway --
-- no permissive write policy names that role -- but a grant nothing can use is
-- dead weight in a file meant to be copied, and it would quietly become live
-- the day someone widens a policy.
grant select on sandbox."posts", sandbox."comments", sandbox."profiles" to anon;
grant select, insert, delete on sandbox."posts", sandbox."comments", sandbox."profiles"
  to authenticated;

grant update ("title", "body")   on sandbox."posts"    to authenticated;
grant update ("body")            on sandbox."comments" to authenticated;
grant update ("handle", "bio")   on sandbox."profiles" to authenticated;

grant all on sandbox."posts", sandbox."comments", sandbox."profiles" to service_role;

-- ============================================================
-- RLS -- the reference implementation
-- ============================================================

alter table sandbox."posts"    enable row level security;
alter table sandbox."comments" enable row level security;
alter table sandbox."profiles" enable row level security;

-- Rule one, on every read policy: quarantined content is invisible to everyone
-- but its author and a moderator.
--
-- This is the single most important line in the file, and the one an
-- integrating app is most likely to leave out. Quarantine is the only
-- moderation outcome whose effect lives in the *app's* policies rather than the
-- platform's, so it is the only one that can be wired up wrong without anything
-- failing loudly -- exactly how the webhook design this replaces used to fail.
create policy "visible_select"
  on sandbox."posts"
  as permissive for select to anon, authenticated
  using (
    "quarantinedBy" is null
    or "authorUserId" = (select auth.uid())
    or "platform".has_permission((select auth.uid()), 'canModerate')
  );

create policy "visible_select"
  on sandbox."comments"
  as permissive for select to anon, authenticated
  using (
    "quarantinedBy" is null
    or "authorUserId" = (select auth.uid())
    or "platform".has_permission((select auth.uid()), 'canModerate')
  );

create policy "public_select"
  on sandbox."profiles"
  as permissive for select to anon, authenticated
  using (true);

-- Rule two, on every write policy: a DevDogs suspension takes effect in every
-- app at once, without any app polling a standing endpoint or applying it
-- itself.
create policy "author_insert"
  on sandbox."posts"
  as permissive for insert to authenticated
  with check (
    "authorUserId" = (select auth.uid())
    and not "platform".is_suspended((select auth.uid()))
  );

create policy "author_insert"
  on sandbox."comments"
  as permissive for insert to authenticated
  with check (
    "authorUserId" = (select auth.uid())
    and not "platform".is_suspended((select auth.uid()))
  );

create policy "own_insert"
  on sandbox."profiles"
  as permissive for insert to authenticated
  with check (
    "userId" = (select auth.uid())
    and not "platform".is_suspended((select auth.uid()))
  );

-- Editing your own content stops while you are suspended, and stops entirely
-- once it is quarantined -- otherwise the author could rewrite the evidence a
-- moderator is looking at.
create policy "author_update"
  on sandbox."posts"
  as permissive for update to authenticated
  using (
    "authorUserId" = (select auth.uid())
    and "quarantinedBy" is null
    and not "platform".is_suspended((select auth.uid()))
  )
  with check ("authorUserId" = (select auth.uid()));

create policy "author_update"
  on sandbox."comments"
  as permissive for update to authenticated
  using (
    "authorUserId" = (select auth.uid())
    and "quarantinedBy" is null
    and not "platform".is_suspended((select auth.uid()))
  )
  with check ("authorUserId" = (select auth.uid()));

create policy "own_update"
  on sandbox."profiles"
  as permissive for update to authenticated
  using (
    "userId" = (select auth.uid())
    and not "platform".is_suspended((select auth.uid()))
  )
  with check ("userId" = (select auth.uid()));

create policy "author_delete"
  on sandbox."posts"
  as permissive for delete to authenticated
  using ("authorUserId" = (select auth.uid()) and "quarantinedBy" is null);

create policy "author_delete"
  on sandbox."comments"
  as permissive for delete to authenticated
  using ("authorUserId" = (select auth.uid()) and "quarantinedBy" is null);

create policy "own_delete"
  on sandbox."profiles"
  as permissive for delete to authenticated
  using ("userId" = (select auth.uid()));

-- The whole schema is unreachable on production. Restrictive, so it composes
-- with AND against every policy above without restating any of them, and `for
-- all` is correct here precisely because SELECT should be denied too.
create policy "non_prod_only"
  on sandbox."posts"
  as restrictive for all to anon, authenticated
  using (not "platform".is_production())
  with check (not "platform".is_production());

create policy "non_prod_only"
  on sandbox."comments"
  as restrictive for all to anon, authenticated
  using (not "platform".is_production())
  with check (not "platform".is_production());

create policy "non_prod_only"
  on sandbox."profiles"
  as restrictive for all to anon, authenticated
  using (not "platform".is_production())
  with check (not "platform".is_production());

-- ============================================================
-- Registration
-- ============================================================

insert into "platform"."apps" ("slug", "schemaName", "displayName")
values ('sandbox', 'sandbox', 'Sandbox');

-- posts and comments need no row here: their foreign key to reportResolutions
-- already makes them content types called 'posts' and 'comments'.
--
-- profiles has no such key, so this row is the only thing that makes it
-- reportable -- and because there is no key, it cannot be quarantined either,
-- which apply_content_action reports as an error rather than a silent no-op.
insert into "platform"."contentTypes"
  ("appId", "tableName", "contentType", "label", "authorColumn", "snapshotColumns", "visibility")
select
  a."id", 'profiles', 'profile', 'Profile', 'userId',
  array['handle', 'bio']::text[], 'public'::"platform"."contentVisibility"
from "platform"."apps" a where a."slug" = 'sandbox';
