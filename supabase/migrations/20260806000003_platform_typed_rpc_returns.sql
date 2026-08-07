-- Client-facing RPCs return rows, not jsonb.
--
-- Every one of these returned `jsonb`, on the stated grounds that a jsonb
-- result needs no generated model and therefore works identically from Dart and
-- TypeScript. Half of that was right and the load-bearing half was not.
--
-- What is true: the Flutter app gets no generated types for these functions.
-- What is false: that `jsonb` is why. supadart generates from PostgREST's
-- OpenAPI document, and PostgREST publishes NO response schema for any RPC --
-- `{"200": {"description": "OK"}}`, identically for a jsonb function and for one
-- already returning a table. On top of that, supadart reads only the *default*
-- REST profile, which is `study_group_finder`; all of these live in `platform`
-- and are outside its view entirely. Dart reads
-- `List<Map<String, dynamic>>` either way, and the wire format is unchanged:
-- PostgREST serialises a set-returning function as a JSON array of objects,
-- which is exactly what `jsonb_agg` was producing by hand.
--
-- What changes is TypeScript. `supabase gen types` reads the *catalog* rather
-- than OpenAPI, so a `returns table (...)` signature gives it every column name
-- and type, and `Returns: Json` becomes a real shape. That deletes the entire
-- reason `@devdogsuga/moderation` hand-wrote return types.
--
-- Two things stay jsonb, deliberately:
--
--   * `resolve_content` / `apply_content_action` / `inspect_content` return
--     whatever an app's own content resolver produced. That shape is per-app by
--     construction and cannot be given columns here.
--   * `conformance_check`'s per-type `checks` array is genuinely nested. The
--     outer row gets columns; the inner list stays jsonb.
--
-- Return types cannot be altered in place, so each function is dropped and
-- recreated. Grants revert to the defaults on recreate, which is correct for
-- every function here -- they are all meant to be client-callable.

-- ============================================================
-- Reference lists
-- ============================================================

drop function if exists "platform".list_report_reasons(text);

create or replace function "platform".list_report_reasons(app_slug text)
returns table ("id" uuid, "title" text, "description" text)
language sql
stable
-- Still invoker: the RLS on "reportReasons" and the restrictive test-identity
-- policy are what make an anonymous visitor and an OAuth test account see
-- nothing. A definer function here would quietly bypass both.
security invoker
set search_path = ''
as $$
  select r."id", r."title"::text, r."description"
  from "platform"."reportReasons" r
  join "platform"."apps" a on a."id" = r."appId"
  where a."slug" = app_slug
  order by r."title";
$$;

drop function if exists "platform".list_feedback_topics(text);

create or replace function "platform".list_feedback_topics(app_slug text)
returns table ("id" uuid, "label" text)
language sql
stable
security invoker
set search_path = ''
as $$
  select t."id", t."label"::text
  from "platform"."feedbackTopics" t
  join "platform"."apps" a on a."id" = t."appId"
  where a."slug" = app_slug
  order by t."label";
$$;

-- ============================================================
-- Filing and submitting
-- ============================================================

drop function if exists "platform".file_report(text, text, text, uuid, text);

create or replace function "platform".file_report(
  app_slug text,
  content_type text,
  content_ref text,
  reason_id uuid,
  description text default null
)
returns table ("reportId" uuid, "corroborated" boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  if not exists (
    select 1 from "platform"."reportReasons" rr
    where rr."id" = reason_id and rr."appId" = app."id"
  ) then
    raise exception 'Reason % does not belong to app "%"', reason_id, app_slug;
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
      ("reportId", "reporterUserId", "reasonId", "description")
    values (existing, caller, reason_id, left(description, 1000))
    -- Named constraint rather than `on conflict ("reportId", ...)`: with a
    -- `returns table` signature, "reportId" is also an OUT parameter, and a
    -- parenthesised conflict target is resolved against BOTH namespaces --
    -- "column reference is ambiguous", raised at runtime only on the
    -- corroboration path. The INSERT column list above is safe (never
    -- substituted); the conflict target is not.
    on conflict on constraint "reportCorroborations_pkey" do nothing;
    return query select existing, true;
    return;
  end if;

  begin
    insert into "platform"."reports" (
      "appId", "reporterUserId", "reportedUserId",
      "contentType", "contentRef", "contentSnapshot", "contentUrl",
      "description", "reasonId"
    ) values (
      app."id", caller, (content ->> 'authorUserId')::uuid,
      content_type, content_ref,
      coalesce(content ->> 'snapshot', ''), content ->> 'url',
      left(description, 1000), reason_id
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
      ("reportId", "reporterUserId", "reasonId", "description")
    values (existing, caller, reason_id, left(description, 1000))
    -- Named constraint rather than `on conflict ("reportId", ...)`: with a
    -- `returns table` signature, "reportId" is also an OUT parameter, and a
    -- parenthesised conflict target is resolved against BOTH namespaces --
    -- "column reference is ambiguous", raised at runtime only on the
    -- corroboration path. The INSERT column list above is safe (never
    -- substituted); the conflict target is not.
    on conflict on constraint "reportCorroborations_pkey" do nothing;
    return query select existing, true;
    return;
  end;

  return query select new_id, false;
end;
$$;

drop function if exists "platform".submit_feedback(
  text, "platform"."feedbackType", text, text, uuid,
  "platform"."feedbackSeverity", jsonb
);

create or replace function "platform".submit_feedback(
  app_slug text,
  feedback_type "platform"."feedbackType",
  title text,
  description text,
  topic_id uuid default null,
  severity "platform"."feedbackSeverity" default null,
  browser_metadata jsonb default null
)
returns table ("feedbackId" uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  app    record;
  new_id uuid;
begin
  if caller is null then
    raise exception 'submit_feedback() requires an authenticated session';
  end if;
  if "platform".is_suspended(caller) then
    raise exception 'Suspended accounts cannot submit feedback';
  end if;
  if "platform".is_test_identity(caller) then
    raise exception 'Test identities cannot submit feedback';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  if topic_id is not null and not exists (
    select 1 from "platform"."feedbackTopics" t
    where t."id" = topic_id and t."appId" = app."id"
  ) then
    raise exception 'Topic % does not belong to app "%"', topic_id, app_slug;
  end if;

  if coalesce(btrim(title), '') = '' then
    raise exception 'Feedback needs a title';
  end if;
  if coalesce(btrim(description), '') = '' then
    raise exception 'Feedback needs a description';
  end if;

  insert into "platform"."feedback" (
    "userId", "appId", "type", "topicId", "severity",
    "title", "description", "browserMetadata"
  ) values (
    caller, app."id", feedback_type, topic_id, severity,
    left(btrim(title), 100), btrim(description), browser_metadata
  ) returning "id" into new_id;

  return query select new_id;
end;
$$;

-- ============================================================
-- What a reporter is told
-- ============================================================

-- `report_outcomes` selects from this, so it goes first.
drop function if exists "platform".report_outcomes(text, timestamp without time zone);
drop function if exists "platform".my_reports(text);

create or replace function "platform".my_reports(app_slug text default null)
returns table (
  "reportId"       uuid,
  "appSlug"        text,
  "contentType"    text,
  "contentRef"     text,
  "contentUrl"     text,
  "snapshot"       text,
  "reason"         text,
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
    rr."title"::text,
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
  join "platform"."reportReasons" rr on rr."id" = r."reasonId"
  left join "platform"."reportResolutions" res on res."reportId" = r."id"
  left join "platform".content_types() c
    on c."appId" = r."appId" and c."contentType" = r."contentType"
  where r."reporterUserId" = (select auth.uid())
    and (app_slug is null or a."slug" = app_slug)
  order by r."createdAt" desc;
$$;

create or replace function "platform".report_outcomes(
  app_slug text default null,
  since timestamp without time zone default null
)
returns table (
  "reportId"       uuid,
  "appSlug"        text,
  "contentType"    text,
  "contentRef"     text,
  "contentUrl"     text,
  "snapshot"       text,
  "reason"         text,
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
  select * from "platform".my_reports(app_slug) m
  where m."status" <> 'open'
    and (since is null or m."resolvedAt" > since);
$$;

-- ============================================================
-- Moderator-facing
-- ============================================================

drop function if exists "platform".list_content_types(text);

create or replace function "platform".list_content_types(app_slug text default null)
returns table (
  "appId"            uuid,
  "appSlug"          text,
  "schemaName"       text,
  "tableName"        text,
  "contentType"      text,
  "label"            text,
  "refColumn"        text,
  "authorColumn"     text,
  "snapshotColumns"  text[],
  "urlTemplate"      text,
  "visibility"       "platform"."contentVisibility",
  "quarantineColumn" text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from "platform".content_types() c
  where "platform".has_permission((select auth.uid()), 'canModerate')
    and (app_slug is null or c."appSlug" = app_slug)
  order by c."appSlug", c."contentType";
$$;

-- ============================================================
-- Resolution
-- ============================================================
--
-- The `_as` variants stay revoked from clients; only the two public entry
-- points below are callable, and both delegate to them.

drop function if exists "platform".resolve_report(
  uuid, "platform"."subjectAction", "platform"."filerAction",
  "platform"."contentAction", text, boolean
);
drop function if exists "platform".dismiss_report(uuid, text);

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

-- ============================================================
-- Conformance check
-- ============================================================
--
-- The outer row gets columns; `checks` stays jsonb because it is a list of
-- {name, ok, detail} objects, which is genuinely nested rather than tabular.
--
-- The existing function is RENAMED rather than dropped and rewritten: its body
-- is ~150 lines of catalog interrogation that has nothing to do with this
-- change, and copying it here to alter the return type would fork it. The
-- permission check lives inside that body and still applies, since the wrapper
-- calls it as the same definer.

alter function "platform".conformance_check(text) rename to conformance_report;

revoke execute on function "platform".conformance_report(text)
  from public, anon, authenticated;

create or replace function "platform".conformance_check(app_slug text)
returns table ("contentType" text, "tableName" text, "checks" jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'conformance_check() requires the canModerate permission';
  end if;

  for rec in
    select
      e.value ->> 'contentType' as ct,
      e.value ->> 'tableName'   as tn,
      e.value -> 'checks'       as ck
    from jsonb_array_elements("platform".conformance_report(app_slug)) as e(value)
  loop
    "contentType" := rec.ct;
    "tableName"   := rec.tn;
    "checks"      := rec.ck;
    return next;
  end loop;
end;
$$;
