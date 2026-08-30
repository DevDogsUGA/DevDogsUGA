-- Moderation RPCs. What a member calls to report content, and what a moderator
-- calls to decide a report.
--
-- One signature per name, and that is the discipline of this file. PostgREST
-- resolves an overload by ARGUMENT NAME, so a second form of file_report or
-- my_reports stays callable alongside the first and turns an existing call
-- ambiguous. That failure lands at runtime, in Dart, with nothing at build time
-- to catch it. The migrations this file replaces dropped each function before
-- recreating it for exactly that reason. Here each exists once, so there is
-- nothing to drop.
--
-- The pairing to understand before editing: resolve_report_as and
-- dismiss_report_as take the moderator as an argument, which makes them
-- impersonation capable, so execute is revoked from clients below.
-- resolve_report and dismiss_report are the browser entry points, and they
-- supply (select auth.uid()) themselves.
--
-- This file sits after reports, the content type registry and the dispatcher.
-- my_reports is `language sql`, and Postgres resolves such a body at CREATE
-- time, so "reports", "apps", "reportResolutions" and content_types() must all
-- already exist.

-- ============================================================
-- list_report_reasons()
-- ============================================================
--
-- The vocabulary is global. One code of conduct across DevDogs, with no per-app
-- and no per-content-type list, so the function takes no arguments and there is
-- nothing left to scope by.
--
-- Titles live in the database rather than in the client packages so that
-- re-wording a reason applies everywhere at once, including retroactively to
-- reports already filed. my_reports returns the enum label rather than a title
-- for the same reason: the client renders the current title from this list.

create or replace function "platform".list_report_reasons()
returns table (
  "reason"      "platform"."reportReason",
  "title"       text,
  "description" text
)
language sql
stable
-- Invoker, deliberately. RLS on "reportReasons" and its restrictive
-- test-identity policy are what make an anonymous visitor and an OAuth test
-- account see nothing. A definer function here would bypass both.
security invoker
set search_path = ''
as $$
  select r."reason", r."title"::text, r."description"
  from "platform"."reportReasons" r
  order by r."position";
$$;

-- ============================================================
-- file_report()
-- ============================================================
--
-- Definer because a reporter has no write access to "reports". The restrictive
-- no_client_insert policy on that table closes every client write, so this
-- function is the only way a row gets in, and it therefore has to check
-- suspension, test identity and the rate limit itself. Nothing else will.
--
-- An invalid reason never reaches the body. The parameter is typed
-- "platform"."reportReason", so the enum rejects it first, with a better error
-- than a lookup here could raise and at no query cost. 'other' is the one label
-- that needs more, and the body demands a description for it, because a
-- catch-all with no sentence attached is unactionable: a moderator can only
-- dismiss it.
--
-- The `on conflict on constraint` targets in the body name
-- reportCorroborations_report_reporter_key, which is created in the reports
-- file. Rename it there and this function fails at runtime, on the
-- corroboration path only.

create or replace function "platform".file_report(
  app_slug     text,
  content_type text,
  content_ref  text,
  reason       "platform"."reportReason",
  description  text default null
)
returns table ("reportId" uuid, "corroborated" boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Generous enough that no honest reporter reaches it, low enough that a
  -- script cannot bury the queue.
  max_per_hour constant integer := 10;
  caller   uuid := (select auth.uid());
  app      record;
  content  jsonb;
  existing uuid;
  recent   integer;
  new_id   uuid;
begin
  if caller is null then
    raise exception 'file_report() requires an authenticated session';
  end if;
  if "platform".is_suspended(caller) then
    raise exception 'Suspended accounts cannot file reports';
  end if;
  if "platform".is_test_identity(caller) then
    raise exception 'Test identities cannot file reports';
  end if;

  if reason = 'other' and coalesce(btrim(description), '') = '' then
    raise exception 'A description is required when the reason is "other"';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  select count(*) into recent
  from "platform"."reports" r
  where r."reporterUserId" = caller
    and r."createdAt" > now() - interval '1 hour';

  if recent >= max_per_hour then
    raise exception 'Too many reports filed in the last hour';
  end if;

  content := "platform".resolve_content(app_slug, content_type, content_ref);
  if content is null then
    raise exception
      'No % with reference % exists in app "%"', content_type, content_ref, app_slug;
  end if;

  select r."id" into existing
  from "platform"."reports" r
  where r."appId" = app."id"
    and r."contentType" = content_type
    and r."contentRef" = content_ref
    and r."status" = 'open';

  if found then
    insert into "platform"."reportCorroborations"
      ("reportId", "reporterUserId", "reason", "description")
    values (existing, caller, reason, left(description, 1000))
    -- Named constraint rather than `on conflict ("reportId", ...)`: with a
    -- `returns table` signature, "reportId" is also an OUT parameter, and a
    -- parenthesised conflict target is resolved against BOTH namespaces --
    -- "column reference is ambiguous", raised at runtime only on this path.
    -- The INSERT column list above is safe (never substituted).
    --
    -- 20260807000000 promoted the (reportId, reporterUserId) unique INDEX to a
    -- real CONSTRAINT so it can be named here. Before that this said
    -- "reportCorroborations_pkey", which is on a defaulted uuid and therefore
    -- never conflicted -- so a second report of the same content by the same
    -- person raised an unhandled unique_violation instead of being swallowed.
    on conflict on constraint "reportCorroborations_report_reporter_key" do nothing;
    return query select existing, true;
    return;
  end if;

  begin
    insert into "platform"."reports" (
      "appId", "reporterUserId", "reportedUserId",
      "contentType", "contentRef", "contentSnapshot", "contentUrl",
      "description", "reason"
    ) values (
      app."id", caller, (content ->> 'authorUserId')::uuid,
      content_type, content_ref,
      coalesce(content ->> 'snapshot', ''), content ->> 'url',
      left(description, 1000), reason
    ) returning "id" into new_id;
  exception when unique_violation then
    -- Two reporters raced on the same content: the partial unique index caught
    -- the second one, which becomes a corroboration like any other.
    select r."id" into existing
    from "platform"."reports" r
    where r."appId" = app."id"
      and r."contentType" = content_type
      and r."contentRef" = content_ref
      and r."status" = 'open';

    insert into "platform"."reportCorroborations"
      ("reportId", "reporterUserId", "reason", "description")
    values (existing, caller, reason, left(description, 1000))
    on conflict on constraint "reportCorroborations_report_reporter_key" do nothing;
    return query select existing, true;
    return;
  end;

  return query select new_id, false;
end;
$$;

-- ============================================================
-- my_reports()
-- ============================================================
--
-- Definer, so the `where r."reporterUserId" = (select auth.uid())` at the
-- bottom of the body is the only thing scoping the result to the caller. It is
-- not a filter for convenience. Remove or widen it and every reporter reads
-- every report.
--
-- Three arguments cover what used to be two functions. `since` and `only_open`
-- absorb report_outcomes, which was this same query wrapped in a where clause
-- and doubled the surface every client had to learn.

create or replace function "platform".my_reports(
  app_slug  text default null,
  since     timestamp without time zone default null,
  -- null: every report. true: open only. false: decided only.
  -- Named `only_open` rather than `open` because OPEN is a plpgsql statement
  -- keyword, and a parameter that reads as one is a trap for whoever ports this
  -- to plpgsql later.
  only_open boolean default null
)
returns table (
  "reportId"       uuid,
  "appSlug"        text,
  "contentType"    text,
  "contentRef"     text,
  "contentUrl"     text,
  "snapshot"       text,
  "reason"         "platform"."reportReason",
  "description"    text,
  "status"         "platform"."reportStatus",
  "createdAt"      timestamp without time zone,
  "resolvedAt"     timestamp without time zone,
  "outcome"        text,
  "contentRemoved" boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r."id",
    a."slug",
    r."contentType",
    r."contentRef",
    r."contentUrl",
    -- Withheld unless the type is marked public. A type that has since been
    -- dropped resolves to no row at all, so `c."visibility"` is null and this
    -- withholds too -- which is the safe direction.
    case when c."visibility" = 'public' then r."contentSnapshot"::text end,
    r."reason",
    r."description"::text,
    r."status",
    r."createdAt",
    r."resolvedAt",
    -- Deliberately coarse. A reporter never learns what happened to the other
    -- user; that is not their business, and the console has the full record.
    case
      when r."status" = 'open' then null
      when r."status" = 'dismissed' then 'dismissed'
      when res."subjectAction" <> 'no_action'
        or res."contentAction" <> 'no_action' then 'action_taken'
      else 'no_violation'
    end,
    coalesce(res."contentAction" = 'quarantine', false)
  from "platform"."reports" r
  join "platform"."apps" a on a."id" = r."appId"
  left join "platform"."reportResolutions" res on res."reportId" = r."id"
  left join "platform".content_types() c
    on c."appId" = r."appId" and c."contentType" = r."contentType"
  where r."reporterUserId" = (select auth.uid())
    and (app_slug is null or a."slug" = app_slug)
    and (only_open is null
         or (only_open and r."status" = 'open')
         or (not only_open and r."status" <> 'open'))
    and (since is null or r."resolvedAt" > since)
  order by r."createdAt" desc;
$$;

-- ============================================================
-- The decision
-- ============================================================
--
-- One implementation, two callers. The console reaches this through Drizzle as
-- the `postgres` role, where there is no JWT to read a moderator from, and the
-- contributor tooling runs in a browser on devdogsuga.org against a different
-- instance, so a server action cannot stand in for either. Both call the same
-- function instead of growing a second copy of the workflow.
--
-- Supabase's native ban cannot be applied from SQL, so it stays with the
-- caller: `bannedUserId` comes back non-null when the decision calls for one,
-- and a caller holding admin credentials finishes the job. A caller without
-- them still records a correct decision and a suspension, which is what every
-- app's write policies actually consult.

create or replace function "platform".resolve_report_as(
  actor uuid,
  report_id uuid,
  subject_action "platform"."subjectAction",
  filer_action "platform"."filerAction",
  content_action "platform"."contentAction",
  moderator_note text default null,
  apply_globally boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report     record;
  app_slug   text;
  resolution uuid;
begin
  if actor is null then
    raise exception 'resolve_report() requires a moderator';
  end if;
  if not "platform".has_permission(actor, 'canModerate') then
    raise exception 'resolve_report() requires the canModerate permission';
  end if;

  select r.*, a."slug" as slug into report
  from "platform"."reports" r
  join "platform"."apps" a on a."id" = r."appId"
  where r."id" = report_id;

  if not found then
    raise exception 'Report % does not exist', report_id;
  end if;
  if report."status" <> 'open' then
    raise exception 'Report % has already been decided', report_id;
  end if;
  app_slug := report.slug;

  update "platform"."reports"
  set "status" = 'resolved', "resolvedAt" = now()
  where "id" = report_id;

  insert into "platform"."reportResolutions" (
    "reportId", "moderatorUserId", "subjectAction", "filerAction",
    "contentAction", "appliedGlobally", "moderatorNote"
  ) values (
    report_id, actor, subject_action, filer_action,
    content_action, coalesce(apply_globally, false), moderator_note
  ) returning "id" into resolution;

  -- Inside the same transaction as the decision, and raises rather than
  -- no-oping, so a content action that cannot be applied aborts the whole
  -- resolution instead of recording an outcome that silently never landed.
  perform "platform".apply_content_action(
    app_slug, report."contentType", report."contentRef", content_action, resolution
  );

  if coalesce(apply_globally, false) then
    if subject_action in ('suspend', 'ban') then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reportedUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;

    if filer_action = 'suspend' then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reporterUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;
  end if;

  return jsonb_build_object(
    'resolutionId', resolution,
    -- Non-null only when Supabase's native ban still has to be applied by a
    -- caller with admin credentials.
    'bannedUserId', case
      when coalesce(apply_globally, false) and subject_action = 'ban'
      then report."reportedUserId"
    end
  );
end;
$$;

create or replace function "platform".dismiss_report_as(
  actor uuid,
  report_id uuid,
  moderator_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A dismissal is a resolution in which nothing happens to anyone, so it is
  -- the same code path rather than a parallel one. The distinction a user sees
  -- -- 'dismissed' rather than 'resolved' -- is applied afterwards, inside the
  -- same transaction.
  perform "platform".resolve_report_as(
    actor, report_id, 'no_action', 'no_action', 'no_action', moderator_note, false
  );

  update "platform"."reports"
  set "status" = 'dismissed'
  where "id" = report_id;

  return jsonb_build_object('dismissed', true);
end;
$$;

-- Impersonation capable: they take the moderator as an argument. Only the
-- service role and `postgres`, which is what the console connects as, may call
-- them. All three grantees in the revoke matter. The default privileges in the
-- first migration grant execute to anon and authenticated, and PUBLIC holds
-- execute on every new function until the last migration closes it, so
-- revoking from one or two of the three leaves the function reachable.
revoke execute on function "platform".resolve_report_as(
  uuid, uuid, "platform"."subjectAction", "platform"."filerAction",
  "platform"."contentAction", text, boolean
) from public, anon, authenticated;

revoke execute on function "platform".dismiss_report_as(uuid, uuid, text)
  from public, anon, authenticated;

-- ============================================================
-- Public entry points
-- ============================================================
--
-- Identical behaviour to the _as pair, with the moderator taken from the
-- session. These return rows rather than the jsonb their delegates return, so
-- `supabase gen types` reads real column names and types out of the catalog
-- instead of Json. The unwrapping in the bodies is the whole difference.

create or replace function "platform".resolve_report(
  report_id uuid,
  subject_action "platform"."subjectAction",
  filer_action "platform"."filerAction",
  content_action "platform"."contentAction",
  moderator_note text default null,
  apply_globally boolean default false
)
returns table ("resolutionId" uuid, "bannedUserId" uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := "platform".resolve_report_as(
    (select auth.uid()), report_id, subject_action, filer_action,
    content_action, moderator_note, apply_globally
  );
  return query select
    (result ->> 'resolutionId')::uuid,
    (result ->> 'bannedUserId')::uuid;
end;
$$;

create or replace function "platform".dismiss_report(
  report_id uuid,
  moderator_note text default null
)
returns table ("dismissed" boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform "platform".dismiss_report_as(
    (select auth.uid()), report_id, moderator_note
  );
  return query select true;
end;
$$;
