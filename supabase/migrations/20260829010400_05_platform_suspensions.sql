-- User suspensions: platform."userSuspensions", the cross-app ban list.
--
-- This table is carved out of the original moderation migration and hoisted
-- into the foundation layer for one reason. platform.is_suspended() is
-- `language sql`, so Postgres parses its body and resolves its relations at
-- CREATE FUNCTION time, not at first call. The helpers file two files down
-- creates that function, so this table has to already exist when it runs. Move
-- this file after the helpers and the migration fails loudly, which is the good
-- outcome. The bad outcome is moving is_suspended() into a `plpgsql` body to
-- "fix" it, which defers the error to runtime.
--
-- Nothing else in the set depends on this file, and no client role can touch
-- the table at all. Rows are written by platform.resolve_report_as(), which is
-- SECURITY DEFINER and therefore not subject to the policies below.

-- One row per (user, service) suspension.
--
-- `service` is the scope. is_suspended() looks only for 'global', which is the
-- value resolve_report_as() writes when a moderator applies a decision
-- org-wide. Per-service rows are accepted by the schema and are inert until
-- something reads them, and the RLS suite asserts that inertness, so a row with
-- service = 'some_app' is data, not a partly-applied global ban.
create table "platform"."userSuspensions" (
  "id"          uuid not null default gen_random_uuid(),
  -- Cascade: a deleted account cannot be suspended, and the ban list should not
  -- accumulate rows pointing at users who no longer exist.
  "userId"      uuid not null,
  "service"     text not null,
  "reason"      text,
  "suspendedAt" timestamp without time zone not null default now(),
  -- `set null` rather than cascade, and nullable from the start: deleting the
  -- moderator who imposed a ban must not lift the ban.
  "suspendedBy" uuid,

  constraint "userSuspensions_pkey" primary key ("id"),
  constraint "userSuspensions_userId_users_id_fkey"
    foreign key ("userId") references auth."users" ("id") on delete cascade,
  constraint "userSuspensions_suspendedBy_users_id_fkey"
    foreign key ("suspendedBy") references auth."users" ("id") on delete set null
);

-- A unique INDEX, deliberately not a unique constraint, and load-bearing either
-- way: resolve_report_as() upserts with `on conflict ("userId", "service")`,
-- which infers this index. Drop it and re-suspending an already-suspended user
-- raises instead of refreshing the row.
create unique index "userSuspensions_user_service_idx"
  on "platform"."userSuspensions" ("userId", "service");

alter table "platform"."userSuspensions" enable row level security;

-- Server-only, and the deny is doubled on purpose. RLS is on and there is no
-- permissive policy anywhere, which is what closes reads today. The four
-- restrictive policies close every command against a permissive policy someone
-- adds later, including SELECT: a member must not be able to see who is banned,
-- and a banned member must not be able to delete their own row.
--
-- These are `to public`, not `to anon, authenticated`, so they also apply to
-- any future role. They do not apply to SECURITY DEFINER functions, which is
-- how resolve_report_as() writes here.
--
-- The four are split per command rather than written as one `for all`. That is
-- the repo-wide convention and it matters: `for all using (false)` would be
-- indistinguishable here but sets the precedent that quietly kills SELECT on
-- the tables that do have a permissive read policy.
create policy "crud_public_policy_select"
  on "platform"."userSuspensions"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."userSuspensions"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_update"
  on "platform"."userSuspensions"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."userSuspensions"
  as restrictive
  for delete
  to public
using (false);
