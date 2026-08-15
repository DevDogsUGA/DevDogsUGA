-- The platform's own profile becomes moderatable content.
--
-- Until now the only registered content types lived in a `sandbox` schema whose
-- entire purpose was to have something to report. That schema is gone: fixtures
-- that exist so a test has a subject are indistinguishable from real tables to
-- everything downstream, and keeping a fake app registered in production so CI
-- had something to point at was the wrong trade. What replaces it is content
-- that actually exists on every tier, and that members can actually abuse -- a
-- display name and a bio.
--
-- ============================================================
-- Quarantine does not mean the same thing for every kind of content
-- ============================================================
--
-- For a forum post, quarantine means HIDE: the row stops being visible to
-- anyone but its author and a moderator, and the app's own read policy is what
-- does the hiding. `conformance_check` therefore insists that a read policy
-- mention the quarantine column, because that is the one moderation outcome
-- that can be wired up wrong while everything appears to work.
--
-- For a profile it means FREEZE, and hiding is not available even in principle:
--
--   * "preferredName" is load-bearing. Rosters, teams, attendance, standings
--     and the leaderboard all render it. A profile row that disappears does not
--     look moderated, it looks like data loss, in half a dozen places at once.
--
--   * the row is already private over PostgREST. profile's SELECT policy is
--     `auth.uid() = "userId"` -- own row only -- so there is nobody for a
--     quarantine predicate to hide it FROM. Adding one would hide the account
--     settings page from its own owner and nothing else.
--
-- What the remedy actually is: the name is reset to the member's name of record
-- and they lose the ability to change it back. So the check has to be told
-- which of the two shapes a type is, or it reports a correct integration as
-- broken -- and a conformance tool that cries wolf on the reference
-- implementation is worse than no tool.

create type "platform"."quarantineEffect" as enum ('hide', 'freeze');

alter table "platform"."contentTypes"
  add column "quarantineEffect" "platform"."quarantineEffect";

comment on column "platform"."contentTypes"."quarantineEffect" is
  'What quarantine does to this type. Null coalesces to ''hide'', which is the right default: hiding is what an app with user-generated content almost always means, and it is the case that needs the read-policy check. ''freeze'' declares that the row stays visible and stops being editable instead.';

-- ============================================================
-- The registration
-- ============================================================

-- The foreign key IS the registration -- see 20260730000002. `on delete set
-- null` so deleting the decision un-freezes the profile, which makes
-- "why is this frozen?" a join rather than a guess.
alter table "platform"."profile"
  add column "quarantinedBy" uuid
    references "platform"."reportResolutions"("id") on delete set null;

-- No grant for it, deliberately, and nothing to revoke either:
-- 20260803000000 already revoked the table-wide UPDATE and granted it back one
-- column at a time, so a column added afterwards is unreachable by clients by
-- default. That is the shape `quarantine_protected` checks for, and it is why
-- the check passes here without a line of its own.

insert into "platform"."contentTypes"
  ("appId", "tableName", "label", "authorColumn", "snapshotColumns", "quarantineEffect")
select
  a."id",
  'profile',
  'Profile',
  -- Derivable -- profile has exactly one foreign key to auth.users -- but
  -- stated anyway. A second FK to auth.users added later (a "verifiedBy",
  -- say) would make the derivation ambiguous, and content_types() answers that
  -- by returning null rather than guessing, which would silently un-register
  -- this type. Naming it makes that change survivable.
  'userId',
  -- Explicit because the DEFAULT IS DANGEROUS HERE. With no row, a snapshot
  -- captures every text/varchar column on the table -- which since
  -- 20260803000000 includes "legalFirstName", "legalLastName" and "ugaEmail".
  -- The snapshot is copied into "reports"."contentSnapshot" and kept forever,
  -- so the default would quietly turn every profile report into a durable
  -- record of the subject's legal name and institutional address.
  array['preferredName', 'bio']::text[],
  'freeze'
from "platform"."apps" a
where a."slug" = 'platform';

-- "visibility" is left null, which coalesces to 'restricted': the snapshot is
-- withheld from the reporter and shown only to a moderator. A bio can hold more
-- than whatever the reporter actually saw, and defaulting closed is the whole
-- point of that column.

-- ============================================================
-- Freeze
-- ============================================================
--
-- Two predicates, both of which the original policy predates.
--
-- "quarantinedBy" is null -- the freeze itself. Without it a member whose name
-- was reset simply sets it back, and the remedy is theatre.
--
-- not is_suspended() -- the cross-app ban, which every other write policy in
-- this repository carries and this one never did. A suspended member could edit
-- their display name and bio for as long as the suspension lasted.
alter policy "crud_authenticated_policy_update"
  on "platform"."profile"
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
--
-- "profileLinks" holds up to five titled URLs rendered on the same public
-- profile page, under its own permissive `auth.uid() = "userId"` policies. A
-- member whose display name and bio were frozen could simply move the abuse
-- into a link title, and nothing in the moderation record would show it.
--
-- Answered with a definer helper rather than an inline subquery: a policy's
-- subquery runs as the querying role, so `select 1 from "platform"."profile"`
-- inside one is itself subject to profile's RLS. That happens to work today
-- because profile's read policy is own-row-only and this only ever asks about
-- the caller's own row -- but it is true by coincidence, and it would fail
-- silently open the day that policy changes.
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

revoke execute on function "platform".is_profile_frozen(uuid) from public, anon;

alter policy "crud_authenticated_policy_insert"
  on "platform"."profileLinks"
  with check (
    (select auth.uid()) = "userId"
    and not "platform".is_profile_frozen("userId")
    and not "platform".is_suspended((select auth.uid()))
  );

alter policy "crud_authenticated_policy_update"
  on "platform"."profileLinks"
  using (
    (select auth.uid()) = "userId"
    and not "platform".is_profile_frozen("userId")
    and not "platform".is_suspended((select auth.uid()))
  )
  with check (
    (select auth.uid()) = "userId"
    and not "platform".is_suspended((select auth.uid()))
  );

alter policy "crud_authenticated_policy_delete"
  on "platform"."profileLinks"
  using (
    (select auth.uid()) = "userId"
    and not "platform".is_profile_frozen("userId")
    and not "platform".is_suspended((select auth.uid()))
  );

-- The avatar is the third piece of the public profile, and it does not live in
-- platform at all.
--
-- 20260616232311 grants a member write access to exactly one object in the
-- `avatars` bucket, the one named after their own user id. Without this a
-- frozen member keeps that access — and an abusive avatar is the same problem
-- as an abusive display name, reachable by a member the moderator believes they
-- have stopped.
--
-- Freezing it rather than deleting it: removing the image is a separate
-- decision from freezing the profile, and a moderator who wants it gone can
-- delete the object. `select` is untouched — the file stays readable, for the
-- same reason the profile row does.
alter policy "avatar_insert_policy"
  on "storage"."objects"
  with check (
    bucket_id = 'avatars'
    AND name = (auth.uid())::text
    AND path_tokens = ARRAY[(auth.uid())::text]
    AND NOT "platform".is_profile_frozen((select auth.uid()))
  );

alter policy "avatar_update_policy"
  on "storage"."objects"
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

alter policy "avatar_delete_policy"
  on "storage"."objects"
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
-- quarantine is APPLIED -- never when a report is merely filed. That property
-- is structural rather than a rule to remember: "quarantinedBy" is a foreign
-- key to a *resolution*, and there is no resolution until a moderator has
-- decided one, so there is no value to write before then.
--
-- Two sources, in order, and it is worth being explicit about why the second is
-- conditional.
--
--   1. "legalFirstName" / "legalLastName". These come from the Involvement
--      roster import (server/actions/verification.ts) and are never cleared by
--      it -- unlike "involvement*", which the import nulls across every row
--      before repopulating, and which is therefore unusable as a name of
--      record. See 20260803000000.
--
--   2. The Google identity's name, ONLY when that identity's email is on the
--      institutional domain. A personal Gmail display name is self-set, so
--      resetting an abusive name to it changes nothing in precisely the case
--      this remedy exists for. "@uga.edu" is what makes the name attested by
--      somebody other than its owner.
--
-- If neither is available the name is left alone rather than blanked. A profile
-- with an empty "preferredName" renders as a gap in every roster, which is a
-- worse outcome than the name a moderator is already looking at -- and the
-- moderator still has "suspend" and "ban" for that.
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
  -- update to a frozen profile would re-run the reset -- and, more to the
  -- point, an un-quarantine would too.
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
    -- the name they were looking at is still there after they resolved -- which
    -- is why this leaves it alone rather than blanking it.
    raise warning
      'platform.profile %: quarantined with no name of record on file; "preferredName" left unchanged',
      new."userId";
  end if;

  return new;
end;
$$;

create trigger "profile_reset_name_on_quarantine"
  before update on "platform"."profile"
  for each row
  when (old."quarantinedBy" is null and new."quarantinedBy" is not null)
  execute function "platform".reset_name_on_quarantine();

revoke execute on function "platform".reset_name_on_quarantine()
  from public, anon, authenticated;

-- ============================================================
-- conformance_report(): branch on the declared effect
-- ============================================================
--
-- The body lives in conformance_report, not conformance_check: 20260806000003
-- renamed it and left conformance_check as a thin `returns table` wrapper over
-- it, so this is the half with the catalog interrogation in it and the wrapper
-- needs no change.
--
-- Identical to 20260730000005's version except for the quarantine block.
-- Recreated in full rather than patched, because there is no way to replace
-- part of a function body and a reader comparing the two should be able to diff
-- them.
create or replace function "platform".conformance_report(app_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app     record;
  ct      record;
  results jsonb := '[]'::jsonb;
  checks  jsonb;
  rel     regclass;
  sample  text;
  resolved jsonb;
  ok      boolean;
  detail  text;
  effect  "platform"."quarantineEffect";
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'conformance_check() requires the canModerate permission';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  for ct in
    select * from "platform".content_types() c where c."appId" = app."id"
    order by c."contentType"
  loop
    checks := '[]'::jsonb;
    rel := (quote_ident(ct."schemaName") || '.' || quote_ident(ct."tableName"))::regclass;

    -- Read straight from the override table rather than through
    -- content_types(): adding a column to a `returns table` signature means
    -- dropping and recreating it, and every function that calls it, for a value
    -- only this check consults.
    select coalesce(o."quarantineEffect", 'hide')
      into effect
      from "platform"."contentTypes" o
     where o."appId" = ct."appId" and o."tableName" = ct."tableName";
    effect := coalesce(effect, 'hide');

    -- 1. Addressable
    checks := checks || jsonb_build_object(
      'name', 'ref_column',
      'ok', ct."refColumn" is not null,
      'detail', coalesce(
        'Rows are addressed by "' || ct."refColumn" || '".',
        'No single-column primary key, so a content reference cannot name a row.'
      )
    );

    -- 2. Attributable
    checks := checks || jsonb_build_object(
      'name', 'author_column',
      'ok', ct."authorColumn" is not null,
      'detail', coalesce(
        'Reports will be filed against "' || ct."authorColumn" || '".',
        'No unambiguous foreign key to auth.users. Set "authorColumn" in platform."contentTypes".'
      )
    );

    -- 3. Resolvable -- against a real row, if there is one.
    ok := false;
    detail := null;
    if ct."refColumn" is not null and ct."authorColumn" is not null then
      begin
        execute "pg_catalog".format(
          'select t.%I::text from %I.%I t limit 1',
          ct."refColumn", ct."schemaName", ct."tableName"
        ) into sample;

        if sample is null then
          detail := 'No rows to test against. Seed some content and run this again.';
        else
          resolved := "platform".resolve_content(app_slug, ct."contentType", sample);
          ok := resolved is not null;
          detail := case
            when ok then 'Resolved a sample row, snapshotting ' ||
                         coalesce(array_length(ct."snapshotColumns", 1), 0)::text ||
                         ' column(s).'
            else 'resolve_content() found no row for a reference taken from the table itself.'
          end;
        end if;
      exception when others then
        detail := 'resolve_content() raised: ' || sqlerrm;
      end;
    else
      detail := 'Skipped: the type is not addressable or not attributable.';
    end if;
    checks := checks || jsonb_build_object(
      'name', 'resolve', 'ok', ok, 'detail', detail
    );

    -- 4/5. Quarantine, and whether clients can tamper with it.
    if ct."quarantineColumn" is null then
      checks := checks || jsonb_build_object(
        'name', 'quarantine',
        'ok', true,
        'detail', 'Not quarantinable. Reports resolve by acting on the user instead.'
      );
    else
      checks := checks || jsonb_build_object(
        'name', 'quarantine',
        'ok', true,
        'detail', 'Quarantine ' || effect::text || 's, writing to "' ||
                  ct."quarantineColumn" || '".'
      );

      ok := not (
        "pg_catalog".has_column_privilege('authenticated', rel, ct."quarantineColumn", 'UPDATE')
        or "pg_catalog".has_column_privilege('anon', rel, ct."quarantineColumn", 'UPDATE')
      );
      checks := checks || jsonb_build_object(
        'name', 'quarantine_protected',
        'ok', ok,
        'detail', case when ok
          then 'Clients cannot write "' || ct."quarantineColumn" || '".'
          else 'Clients CAN write "' || ct."quarantineColumn" ||
               '", so an author can un-hide their own content. Column-level REVOKE does not ' ||
               'override a table-wide UPDATE grant -- revoke UPDATE on the table, then grant it back per column.'
        end
      );

      -- The effect-dependent half. Both are heuristics over policy text, and
      -- both are the same heuristic pointed at a different command: whichever
      -- policy is supposed to ACT on the column had better mention it.
      if effect = 'hide' then
        ok := exists (
          select 1 from "pg_catalog".pg_policy p
          where p.polrelid = rel
            and p.polcmd in ('r', '*')
            and "pg_catalog".pg_get_expr(p.polqual, p.polrelid) like '%' || ct."quarantineColumn" || '%'
        );
        checks := checks || jsonb_build_object(
          'name', 'read_policy_filters_quarantine',
          'ok', ok,
          'detail', case when ok
            then 'A read policy references "' || ct."quarantineColumn" || '".'
            else 'No read policy mentions "' || ct."quarantineColumn" ||
                 '". Quarantined content would stay visible: the platform sets the column, ' ||
                 'but only your policies can act on it. If quarantine is meant to freeze ' ||
                 'rather than hide this type, say so with "quarantineEffect" in platform."contentTypes".'
          end
        );
      else
        ok := exists (
          select 1 from "pg_catalog".pg_policy p
          where p.polrelid = rel
            and p.polcmd in ('w', '*')
            and "pg_catalog".pg_get_expr(p.polqual, p.polrelid) like '%' || ct."quarantineColumn" || '%'
        );
        checks := checks || jsonb_build_object(
          'name', 'write_policy_freezes_quarantine',
          'ok', ok,
          'detail', case when ok
            then 'An update policy references "' || ct."quarantineColumn" ||
                 '", so a quarantined row stops being editable.'
            else 'This type declares quarantineEffect = ''freeze'', but no update policy mentions "' ||
                 ct."quarantineColumn" || '". The author could edit the content straight back, ' ||
                 'and rewrite the evidence a moderator is looking at.'
          end
        );
      end if;
    end if;

    -- 6. Heuristic: do write policies consult the cross-app ban?
    ok := exists (
      select 1 from "pg_catalog".pg_policy p
      where p.polrelid = rel
        and p.polcmd in ('a', 'w', '*')
        and coalesce(
          "pg_catalog".pg_get_expr(p.polwithcheck, p.polrelid), ''
        ) || coalesce(
          "pg_catalog".pg_get_expr(p.polqual, p.polrelid), ''
        ) like '%is_suspended%'
    );
    checks := checks || jsonb_build_object(
      'name', 'write_policy_checks_suspension',
      'ok', ok,
      'detail', case when ok
        then 'Write policies call platform.is_suspended().'
        else 'No write policy calls platform.is_suspended(), so a DevDogs suspension will not stop writes here.'
      end
    );

    results := results || jsonb_build_object(
      'contentType', ct."contentType",
      'tableName', ct."schemaName" || '.' || ct."tableName",
      'checks', checks
    );
  end loop;

  return results;
end;
$$;
