-- ============================================================
-- Profile freeze
-- ============================================================
--
-- The platform's own profile becomes moderatable content. This file adds
-- platform.profile."quarantinedBy", registers the profile table as a content
-- type with quarantineEffect 'freeze', creates platform.is_profile_frozen(),
-- creates the name-reset trigger, and creates the seven policies whose final
-- predicates depend on that function: profile UPDATE, the three write policies
-- on "profileLinks", and the three avatar policies on storage.objects.
--
-- The one thing to know before editing: this file, not file 01, is where those
-- seven policies are created. A policy predicate is parsed at CREATE POLICY
-- time, so a policy calling is_profile_frozen cannot exist before the function,
-- and is_profile_frozen reads "quarantinedBy", which references
-- "reportResolutions" from file 22. Everything here is downstream of that one
-- chain. The four remaining policies on the two profile tables (profile
-- select/insert/delete and "profileLinks" select) are final in file 01 and are
-- not repeated here.
--
-- Quarantine does not mean the same thing for every kind of content. For a
-- forum post it means HIDE: the row stops being visible to anyone but its
-- author and a moderator, and the app's own read policy does the hiding. For a
-- profile it means FREEZE, and hiding is not available even in principle:
--
--   * "preferredName" is load-bearing. Rosters, teams, attendance, standings
--     and the leaderboard all render it. A profile row that disappears does not
--     look moderated, it looks like data loss, in half a dozen places at once.
--
--   * the row is already private over PostgREST. profile's SELECT policy is
--     `auth.uid() = "userId"`, own row only, so there is nobody for a quarantine
--     predicate to hide it from. Adding one would hide the account settings
--     page from its own owner and nothing else.
--
-- What the remedy actually is: the name is reset to the member's name of record
-- and they lose the ability to change it back. conformance_report() in file 25
-- branches on the declared effect for the same reason, so that a correct freeze
-- integration is not reported as a broken hide integration.


-- ============================================================
-- The registration
-- ============================================================

-- The foreign key IS the registration. See file 23: a table is moderatable when
-- it carries a foreign key to "reportResolutions", so there is no registration
-- to drift out of sync with the schema. `on delete set null` so deleting the
-- decision un-freezes the profile, which makes "why is this frozen?" a join
-- rather than a guess. The constraint name is left to Postgres
-- (profile_quarantinedBy_fkey); nothing references it.
--
-- This column MUST be added here and not in file 01's create table. File 01
-- revokes the table-wide UPDATE and grants back eleven columns; a column added
-- after that grant is unreachable by clients with no statement of its own,
-- which is exactly how a frozen member is stopped from clearing their own
-- freeze. Move it into the create table and it falls under the table-wide grant
-- that default privileges hand out, and the freeze becomes advisory.
alter table "platform"."profile"
  add column "quarantinedBy" uuid
    references "platform"."reportResolutions"("id") on delete set null;

insert into "platform"."contentTypes"
  ("appId", "tableName", "label", "authorColumn", "snapshotColumns", "quarantineEffect")
select
  a."id",
  'profile',
  'Profile',
  -- Derivable, since profile has exactly one foreign key to auth.users, but
  -- stated anyway. A second FK to auth.users added later (a "verifiedBy", say)
  -- would make the derivation ambiguous, and content_types() answers ambiguity
  -- with null rather than a guess, which would silently un-register this type.
  'userId',
  -- Explicit because the default is dangerous here. With no row, a snapshot
  -- captures every text and varchar column on the table, which now includes
  -- "legalFirstName", "legalLastName" and "ugaEmail". The snapshot is copied
  -- into "reports"."contentSnapshot" and kept forever, so the default would
  -- quietly turn every profile report into a durable record of the subject's
  -- legal name and institutional address.
  array['preferredName', 'bio']::text[],
  'freeze'
from "platform"."apps" a
where a."slug" = 'platform';

-- "visibility" is left null, which coalesces to 'restricted': the snapshot is
-- withheld from the reporter and shown only to a moderator. A bio can hold more
-- than whatever the reporter actually saw, and defaulting closed is the whole
-- point of that column.


-- ============================================================
-- is_profile_frozen
-- ============================================================
--
-- A definer helper rather than an inline subquery in each policy. A policy's
-- subquery runs as the querying role, so `select 1 from "platform"."profile"`
-- inside one is itself subject to profile's RLS. That happens to work today
-- because profile's read policy is own-row-only and the policies below only
-- ever ask about the caller's own row, but it is true by coincidence, and it
-- would fail silently open the day that policy changes.
create or replace function "platform".is_profile_frozen(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from "platform"."profile" p
    where p."userId" = uid and p."quarantinedBy" is not null
  );
$$;

-- public and anon only. `authenticated` deliberately KEEPS execute: an RLS
-- predicate is evaluated as the querying role, so revoking it from
-- authenticated would make every write policy below raise a permission error
-- for the members those policies exist to allow.
revoke execute on function "platform".is_profile_frozen(uuid) from public, anon;


-- ============================================================
-- The frozen write policies
-- ============================================================
--
-- Seven policies, created here in final form. Their names repeat names used on
-- other tables and are targeted by name from application code and tests, so
-- they must not be renamed or merged.
--
-- Two predicates run through them:
--
--   "quarantinedBy" is null / not is_profile_frozen(...)
--                   The freeze itself. Without it a member whose name was reset
--                   simply sets it back and the remedy is decorative.
--   not is_suspended(...)
--                   The cross-app ban, which every other write policy in this
--                   repo carries and these four did not until moderation
--                   landed. A suspended member could edit their display name
--                   and bio for as long as the suspension lasted.
--
-- The freeze clause sits in a DIFFERENT half on each policy, and the four
-- shapes are deliberate. Read them before you "make them consistent":
--
--   profile UPDATE            freeze in USING, NOT in WITH CHECK
--   profileLinks INSERT       no USING at all, freeze in WITH CHECK
--   profileLinks UPDATE       freeze in USING only
--   profileLinks DELETE       freeze in USING
--
-- USING decides which existing rows the command may touch, so a freeze there
-- stops a frozen member editing or removing what is already on the page. Adding
-- the freeze to profile's WITH CHECK as well would block the reset trigger's
-- own resulting row shape from the member's later legitimate writes for no gain,
-- and the USING clause has already refused the statement by then.
--
-- profile UPDATE also reads "quarantinedBy" directly rather than calling the
-- helper: it is a predicate over the row being updated, so the column is right
-- there. That reference is what conformance_report()'s
-- write_policy_freezes_quarantine check looks for in the policy text.

create policy "crud_authenticated_policy_update"
  on "platform"."profile"
  as permissive
  for update
  to authenticated
using (
  (select auth.uid()) = "userId"
  and "quarantinedBy" is null
  and not "platform".is_suspended((select auth.uid()))
)
with check (
  (select auth.uid()) = "userId"
  and not "platform".is_suspended((select auth.uid()))
);

-- The public profile is two tables, so freezing one of them is not a freeze.
-- "profileLinks" holds up to five titled URLs rendered on the same public
-- profile page. A member whose display name and bio were frozen could move the
-- abuse into a link title, and nothing in the moderation record would show it.
--
-- These three pass "userId", the row's own column, where the avatar policies
-- below pass (select auth.uid()). Same value in practice, since the own-row
-- clause is right beside it, but the row column is what makes the freeze hold
-- if a future policy ever lets one member write another's link.
--
-- crud_authenticated_policy_select on "profileLinks" is NOT here: it is final
-- in file 01. A frozen member still gets to see the links they cannot edit.

create policy "crud_authenticated_policy_insert"
  on "platform"."profileLinks"
  as permissive
  for insert
  to authenticated
with check (
  (select auth.uid()) = "userId"
  and not "platform".is_profile_frozen("userId")
  and not "platform".is_suspended((select auth.uid()))
);

create policy "crud_authenticated_policy_update"
  on "platform"."profileLinks"
  as permissive
  for update
  to authenticated
using (
  (select auth.uid()) = "userId"
  and not "platform".is_profile_frozen("userId")
  and not "platform".is_suspended((select auth.uid()))
)
with check (
  (select auth.uid()) = "userId"
  and not "platform".is_suspended((select auth.uid()))
);

create policy "crud_authenticated_policy_delete"
  on "platform"."profileLinks"
  as permissive
  for delete
  to authenticated
using (
  (select auth.uid()) = "userId"
  and not "platform".is_profile_frozen("userId")
  and not "platform".is_suspended((select auth.uid()))
);


-- ============================================================
-- The avatar, which is the third piece of the public profile
-- ============================================================
--
-- These three live on storage.objects, not on anything in platform. They grant
-- a member write access to exactly one object in the `avatars` bucket, the one
-- named after their own user id. Without the freeze clause a frozen member
-- keeps that access, and an abusive avatar is the same problem as an abusive
-- display name, reachable by a member the moderator believes they stopped.
--
-- Freezing rather than deleting: removing the image is a separate decision from
-- freezing the profile, and a moderator who wants it gone can delete the
-- object. There is no avatar SELECT policy at all, here or anywhere. The bucket
-- is public, so reads go through Supabase's public-bucket path and the file
-- stays readable, for the same reason the profile row does.
--
-- The bucket itself is NOT created here. No migration in this repo touches
-- storage.buckets; `avatars` is declared in supabase/config.toml. Inserting it
-- here would collide with that.
--
-- Note the asymmetry between insert/update and delete: delete's USING is
-- bucket_id + name + the freeze, with NO path_tokens clause. That has always
-- been its shape. Adding one to "match the others" changes the policy.

create policy "avatar_insert_policy"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND path_tokens = ARRAY[(auth.uid())::text]
  AND NOT "platform".is_profile_frozen((select auth.uid()))
);

create policy "avatar_update_policy"
on "storage"."objects"
as permissive
for update
to authenticated
using (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND path_tokens = ARRAY[(auth.uid())::text]
  AND NOT "platform".is_profile_frozen((select auth.uid()))
)
with check (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND path_tokens = ARRAY[(auth.uid())::text]
  AND NOT "platform".is_profile_frozen((select auth.uid()))
);

create policy "avatar_delete_policy"
on "storage"."objects"
as permissive
for delete
to authenticated
using (
  bucket_id = 'avatars'
  AND name = (auth.uid())::text
  AND NOT "platform".is_profile_frozen((select auth.uid()))
);


-- ============================================================
-- The name of record
-- ============================================================
--
-- Resetting an abusive display name is the actual remedy, and it fires when
-- quarantine is APPLIED, never when a report is merely filed. That property is
-- structural rather than a rule to remember: "quarantinedBy" is a foreign key
-- to a resolution, and there is no resolution until a moderator has decided
-- one, so there is no value to write before then.
--
-- Two sources, in order, and the second is conditional on purpose.
--
--   1. "legalFirstName" / "legalLastName". These come from the Involvement
--      roster import (server/actions/verification.ts) and are never cleared by
--      it, unlike "involvement*", which the import nulls across every row
--      before repopulating and which is therefore unusable as a name of record.
--
--   2. The Google identity's name, ONLY when that identity's email is on the
--      institutional domain. A personal Gmail display name is self-set, so
--      resetting an abusive name to it changes nothing in precisely the case
--      this remedy exists for. "@uga.edu" is what makes the name attested by
--      somebody other than its owner.
--
-- If neither is available the name is left alone rather than blanked. A profile
-- with an empty "preferredName" renders as a gap in every roster, which is a
-- worse outcome than the name a moderator is already looking at, and the
-- moderator still has suspend and ban for that.
--
-- The auth.identities read is why this function is definer.
create or replace function "platform".reset_name_on_quarantine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name_of_record text;
begin
  -- Only on the transition into quarantine. Without this guard every later
  -- update to a frozen profile would re-run the reset, and so would an
  -- un-quarantine.
  if new."quarantinedBy" is null or old."quarantinedBy" is not null then
    return new;
  end if;

  name_of_record := btrim(
    concat_ws(' ', btrim(new."legalFirstName"), btrim(new."legalLastName"))
  );

  if coalesce(name_of_record, '') = '' then
    select btrim(i.identity_data ->> 'name')
      into name_of_record
      from auth.identities i
     where i.user_id = new."userId"
       and i.provider = 'google'
       and lower(i.identity_data ->> 'email') like '%@uga.edu'
     limit 1;
  end if;

  if coalesce(name_of_record, '') <> '' then
    -- "preferredName" is varchar(255); a longer name would abort the
    -- moderator's whole resolution rather than truncate.
    new."preferredName" := left(name_of_record, 255);
  else
    -- Reaches the Postgres log, not the console. The moderator's signal is that
    -- the name they were looking at is still there after they resolved, which
    -- is why this leaves it alone rather than blanking it.
    raise warning
      'platform.profile %: quarantined with no name of record on file; "preferredName" left unchanged',
      new."userId";
  end if;

  return new;
end;
$$;

-- The WHEN clause repeats the guard inside the function. Both are wanted: the
-- clause keeps the function from being called on every profile update at all,
-- the guard keeps the function correct if it is ever called from anywhere else.
create trigger "profile_reset_name_on_quarantine"
  before update on "platform"."profile"
  for each row
  when (old."quarantinedBy" is null and new."quarantinedBy" is not null)
  execute function "platform".reset_name_on_quarantine();

-- Unlike is_profile_frozen, this one is revoked from authenticated too. It is
-- reached only through the trigger, which runs as the table owner regardless of
-- who issued the UPDATE, so no client needs execute on it.
revoke execute on function "platform".reset_name_on_quarantine()
  from public, anon, authenticated;
