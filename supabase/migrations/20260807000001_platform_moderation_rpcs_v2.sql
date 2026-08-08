-- The public reporting contract, reduced to three functions.
--
-- Every signature here changes, so every one is dropped before it is recreated.
-- That is not tidiness: PostgREST resolves overloads by ARGUMENT NAME, so a
-- `create or replace` that adds or removes a parameter leaves both forms
-- callable and makes an existing call ambiguous -- failing at runtime, in Dart,
-- with nothing at build time to catch it. Same reasoning as 20260806000003.

-- ============================================================
-- list_report_reasons() -- no arguments
-- ============================================================
--
-- The vocabulary is global: one code of conduct across DevDogs, with no per-app
-- and no per-content-type list, so there is nothing left to scope by.
--
-- It still exists rather than shipping the titles inside the client packages,
-- because Dart would then need its own copy and re-wording a reason would
-- require an app release. Titles live in the database precisely so a change to
-- one applies everywhere at once, including retroactively to reports already
-- filed -- see my_reports below, which returns the label and lets the client
-- render the current title.

drop function if exists "platform".list_report_reasons(text);

create or replace function "platform".list_report_reasons()
returns table (
  "reason"      "platform"."reportReason",
  "title"       text,
  "description" text
)
language sql
stable
-- Still invoker. RLS on "reportReasons" and its restrictive test-identity
-- policy are what make an anonymous visitor and an OAuth test account see
-- nothing; a definer function here would quietly bypass both.
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
-- Two changes from 20260806000003, one of them a deletion.
--
-- DELETED: the check that the reason belonged to the app. With a single global
-- vocabulary there is no such thing, and an invalid label is rejected by the
-- parameter's own type before this body runs -- a better error than the old
-- 'Reason % does not belong to app "%"', and one that costs no query.
--
-- ADDED: 'other' requires a description. It is the catch-all, and a catch-all
-- with no sentence attached is unactionable -- a moderator can only dismiss it.
-- Enforced here rather than in the dialog so it holds for Dart and TypeScript
-- alike.

drop function if exists "platform".file_report(text, text, text, uuid, text);

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
-- my_reports() absorbs report_outcomes()
-- ============================================================
--
-- report_outcomes was `select * from my_reports(app_slug) where status <>
-- 'open' and resolvedAt > since` -- a where-clause with a function around it,
-- doubling the surface every client had to learn. It is now two parameters.
--
-- "reason" returns the enum label rather than a title. That is what makes
-- re-wording retroactive: the client renders the current title from
-- list_report_reasons() instead of whatever the title happened to be when the
-- report was filed. It also drops a join.

drop function if exists "platform".report_outcomes(text, timestamp without time zone);
drop function if exists "platform".my_reports(text);

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
