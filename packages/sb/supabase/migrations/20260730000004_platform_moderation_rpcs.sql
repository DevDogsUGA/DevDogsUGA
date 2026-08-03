-- The public contract: dispatcher plus the RPCs every app calls.
--
-- There is no HTTP API and no SDK that owns this contract. It is these
-- functions and the RLS around them, reached through PostgREST, so TypeScript
-- and Dart call the same things the same way. The TS package added later is
-- sugar over these calls, not the interface.
--
-- Why RPCs rather than letting clients write the tables directly:
--
--   1. A client filing a report knows the content reference and the reason. It
--      does not legitimately know "reportedUserId" or "contentSnapshot" -- those
--      have to come from the content itself, or a malicious client can attribute
--      content to the wrong user and hand moderators fabricated evidence.
--   2. Corroboration, rate limiting and snapshotting are decisions, not inserts.
--   3. supadart reads only PostgREST's default schema, which is
--      study_group_finder (see config.toml), so the Flutter app will never have
--      generated Dart models for platform tables. A function returning jsonb
--      needs no model; table access would need hand-written Dart mirroring the
--      TypeScript types by eye.
--
-- Reads are RPCs for reason 3 as well.

-- ============================================================
-- Dispatcher
-- ============================================================

-- Returns the content behind (app, type, ref), or null when no such row exists.
--
-- NOT callable by clients. It reads any registered app's content as the
-- definer, so exposing it would turn reporting into a disclosure oracle for
-- private content -- ask about a row you cannot see and read its snapshot back.
-- file_report calls it and stores the snapshot without ever returning it; a
-- moderator reaches it through inspect_content(), which gates on canModerate.
--
-- A custom "contentResolver" wins when the app registered one, for content a
-- declarative type cannot describe -- assembled across tables, say. Its contract
-- is (content_type text, content_ref text) returns jsonb, returning the same
-- shape this does.
create or replace function "platform".resolve_content(
  app_slug text,
  content_type text,
  content_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  app        record;
  ct         record;
  resolver   regprocedure;
  result     jsonb;
  snap_expr  text;
  row_found  boolean;
  author_id  uuid;
  snapshot   text;
begin
  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  if app."contentResolver" is not null then
    -- Resolved from its text signature at call time rather than held as a
    -- regprocedure column, because an OID goes stale the moment the function is
    -- dropped and recreated and does not survive dump/restore.
    resolver := to_regprocedure(app."contentResolver");
    if resolver is null then
      raise exception
        'App "%" names a contentResolver that does not exist: %',
        app_slug, app."contentResolver";
    end if;
    execute format('select %s($1, $2)', resolver::regproc)
      into result using content_type, content_ref;
    return result;
  end if;

  select * into ct
  from "platform".content_types() c
  where c."appId" = app."id" and c."contentType" = content_type;

  if not found then
    raise exception 'App "%" has no content type "%"', app_slug, content_type;
  end if;

  -- Derivation returns misconfigured types rather than hiding them, so these
  -- are the two ways a type can exist but be unusable.
  if ct."refColumn" is null then
    raise exception
      'Content type "%" in app "%" has no single-column primary key, so a content reference cannot address a row',
      content_type, app_slug;
  end if;
  if ct."authorColumn" is null then
    raise exception
      'Content type "%" in app "%" has no unambiguous foreign key to auth.users; set "authorColumn" in platform."contentTypes"',
      content_type, app_slug;
  end if;

  -- Identifiers only, quoted with %I. The validation trigger on
  -- platform."contentTypes" already refused any name that is not a real column,
  -- so this cannot be reached with an expression in it.
  select string_agg(format('t.%I::text', col), ', ' order by ord)
    into snap_expr
    from unnest(ct."snapshotColumns") with ordinality as u(col, ord);

  execute format(
    'select true, t.%I::text, left(concat_ws(%L, %s), 5000) from %I.%I t where t.%I::text = $1',
    ct."authorColumn",
    E'\n\n',
    coalesce(snap_expr, 'null'),
    ct."schemaName", ct."tableName", ct."refColumn"
  ) into row_found, author_id, snapshot using content_ref;

  if not coalesce(row_found, false) then
    return null;
  end if;

  return jsonb_build_object(
    'appId',         app."id",
    'appSlug',       app_slug,
    'contentType',   ct."contentType",
    'contentRef',    content_ref,
    'label',         ct."label",
    'authorUserId',  author_id,
    'snapshot',      snapshot,
    'url',           case
                       when ct."urlTemplate" is not null
                       then replace(ct."urlTemplate", '{ref}', content_ref)
                     end,
    'visibility',    ct."visibility",
    'quarantinable', ct."quarantineColumn" is not null
  );
end;
$$;

-- Carries a moderation decision into the app's own data.
--
-- Raises rather than returning quietly when the type cannot be quarantined, and
-- runs inside the resolution transaction, so a broken setup aborts the decision
-- and surfaces to the moderator. The alternative -- recording an outcome whose
-- effect silently never landed -- is the exact failure mode of the webhook
-- delivery this replaces.
--
-- NOT callable by clients: it writes any registered app's content as the
-- definer.
create or replace function "platform".apply_content_action(
  app_slug text,
  content_type text,
  content_ref text,
  action "platform"."contentAction",
  resolution_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app      record;
  ct       record;
  actioner regprocedure;
  affected integer;
begin
  if action = 'no_action' then
    return;
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  -- The escape hatch for a quarantine that means something non-trivial:
  -- cascading from a resource to its comments, or a soft-delete spanning
  -- tables. Contract:
  -- (content_type text, content_ref text, action platform."contentAction", resolution_id uuid).
  if app."contentActioner" is not null then
    actioner := to_regprocedure(app."contentActioner");
    if actioner is null then
      raise exception
        'App "%" names a contentActioner that does not exist: %',
        app_slug, app."contentActioner";
    end if;
    execute format('select %s($1, $2, $3, $4)', actioner::regproc)
      using content_type, content_ref, action, resolution_id;
    return;
  end if;

  select * into ct
  from "platform".content_types() c
  where c."appId" = app."id" and c."contentType" = content_type;

  if not found then
    raise exception 'App "%" has no content type "%"', app_slug, content_type;
  end if;

  if ct."quarantineColumn" is null then
    raise exception
      'Content type "%" in app "%" cannot be quarantined: "%"."%" has no foreign key to platform."reportResolutions". Add one, or resolve with a different content action.',
      content_type, app_slug, ct."schemaName", ct."tableName";
  end if;
  if ct."refColumn" is null then
    raise exception
      'Content type "%" in app "%" has no single-column primary key, so a content reference cannot address a row',
      content_type, app_slug;
  end if;

  execute format(
    'update %I.%I set %I = $1 where %I::text = $2',
    ct."schemaName", ct."tableName", ct."quarantineColumn", ct."refColumn"
  ) using resolution_id, content_ref;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception
      'No % with reference % exists in app "%"; nothing was quarantined',
      content_type, content_ref, app_slug;
  end if;
end;
$$;

-- `from public, anon, authenticated`, and all three are load-bearing: PUBLIC
-- holds EXECUTE on every function by default, and platform's default privileges
-- additionally grant it to anon and authenticated by name. Revoking either one
-- alone leaves both functions reachable, silently -- see the same note in
-- 20260730000002_platform_content_types.sql.
--
-- Without this, resolve_content is a disclosure oracle for every registered
-- app's private content, and apply_content_action lets any signed-in user
-- quarantine anything.
revoke execute on function "platform".resolve_content(text, text, text)
  from public, anon, authenticated;
revoke execute on function
  "platform".apply_content_action(text, text, text, "platform"."contentAction", uuid)
  from public, anon, authenticated;

-- ============================================================
-- Moderator surface
-- ============================================================

-- What the catalog detected for an app: which tables are content types, what
-- the derivation produced for each, and which of them support quarantine. This
-- is what the tools page shows and what the conformance check reads.
create or replace function "platform".list_content_types(app_slug text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(c) order by c."appSlug", c."contentType"),
    '[]'::jsonb
  )
  from "platform".content_types() c
  where "platform".has_permission((select auth.uid()), 'canModerate')
    and (app_slug is null or c."appSlug" = app_slug);
$$;

-- The privileged refetch: live content behind a report, for a moderator
-- deciding whether it still says what the snapshot says it did.
create or replace function "platform".inspect_content(
  app_slug text,
  content_type text,
  content_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not "platform".has_permission((select auth.uid()), 'canModerate') then
    raise exception 'inspect_content() requires the canModerate permission';
  end if;
  return "platform".resolve_content(app_slug, content_type, content_ref);
end;
$$;

-- ============================================================
-- Feedback policies
-- ============================================================
--
-- The policies on this table hand-inlined the userRoles/roles join:
--
--   exists (select 1 from platform."userRoles" ur
--           join platform.roles r on r.id = ur."roleId"
--           where ur."userId" = auth.uid() and r."canManageFeedback")
--
-- That branch has never once evaluated true. The subquery runs as the caller,
-- and platform."userRoles" denies SELECT to clients outright
-- (`crud_public_policy_select ... using (false)`), so a feedback manager reading
-- through PostgREST sees nothing but their own submissions. Nothing caught it
-- because the console reads this table through Drizzle as the `postgres` role,
-- which bypasses RLS entirely -- and until the tooling moved into the browser,
-- that was the only reader there was.
--
-- This is precisely the drift 20260729000000 introduced has_permission() to
-- stop: it is `security definer`, so it answers the same question without
-- depending on what the caller may read.
drop policy if exists "crud_authenticated_policy_select" on "platform"."feedback";
drop policy if exists "crud_authenticated_policy_update" on "platform"."feedback";
drop policy if exists "crud_authenticated_policy_insert" on "platform"."feedback";

create policy "own_or_manager_select"
  on "platform"."feedback"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "userId"
    or "platform".has_permission((select auth.uid()), 'canManageFeedback')
  );

create policy "manager_update"
  on "platform"."feedback"
  as permissive for update to authenticated
  using ("platform".has_permission((select auth.uid()), 'canManageFeedback'))
  with check ("platform".has_permission((select auth.uid()), 'canManageFeedback'));

-- Submissions go through submit_feedback(), which is what checks suspension and
-- that the topic belongs to the app. A direct insert would skip both.
create policy "no_client_insert"
  on "platform"."feedback"
  as restrictive for insert to anon, authenticated
  with check (false);

-- ============================================================
-- Public contract
-- ============================================================

-- security invoker, not definer: RLS then applies as written, so the
-- restrictive deny_test_identities policy on these tables keeps working and
-- there is no second copy of that rule to keep in step.
create or replace function "platform".list_report_reasons(app_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', r."id", 'title', r."title", 'description', r."description")
      order by r."title"
    ),
    '[]'::jsonb
  )
  from "platform"."reportReasons" r
  join "platform"."apps" a on a."id" = r."appId"
  where a."slug" = app_slug;
$$;

create or replace function "platform".list_feedback_topics(app_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', t."id", 'label', t."label") order by t."label"),
    '[]'::jsonb
  )
  from "platform"."feedbackTopics" t
  join "platform"."apps" a on a."id" = t."appId"
  where a."slug" = app_slug;
$$;

-- Files a report against a piece of content in a registered app.
--
-- The caller supplies only what it legitimately knows. "reportedUserId" and
-- "contentSnapshot" are read from the content itself, so neither can be
-- falsified, and the snapshot is frozen here so a moderator reviews what was
-- actually reported even if the content later changes or is deleted.
--
-- Returns { reportId, corroborated }. A second reporter on content that already
-- has an open report corroborates it rather than queueing a duplicate.
create or replace function "platform".file_report(
  app_slug text,
  content_type text,
  content_ref text,
  reason_id uuid,
  description text default null
)
returns jsonb
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
  -- Test identities carry no application data and exist only to verify an OAuth
  -- integration, so there is nothing for them to legitimately report.
  if "platform".is_test_identity(caller) then
    raise exception 'Test identities cannot file reports';
  end if;

  select * into app from "platform"."apps" a where a."slug" = app_slug;
  if not found then
    raise exception 'Unknown app "%"', app_slug;
  end if;

  -- The composite FK on "reports" enforces this too; checking here turns a
  -- constraint violation into something the client can show a user.
  if not exists (
    select 1 from "platform"."reportReasons" r
    where r."id" = reason_id and r."appId" = app."id"
  ) then
    raise exception 'Reason % does not belong to app "%"', reason_id, app_slug;
  end if;

  select count(*) into recent
  from (
    select "createdAt" from "platform"."reports"
      where "reporterUserId" = caller and "createdAt" > now() - interval '1 hour'
    union all
    select "createdAt" from "platform"."reportCorroborations"
      where "reporterUserId" = caller and "createdAt" > now() - interval '1 hour'
  ) s;
  if recent >= max_per_hour then
    raise exception 'Too many reports filed in the last hour; try again later';
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
    on conflict ("reportId", "reporterUserId") do nothing;
    return jsonb_build_object('reportId', existing, 'corroborated', true);
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
    on conflict ("reportId", "reporterUserId") do nothing;
    return jsonb_build_object('reportId', existing, 'corroborated', true);
  end;

  return jsonb_build_object('reportId', new_id, 'corroborated', false);
end;
$$;

-- Submits feedback about a registered app.
--
-- First-party feedback from the DevDogs site is simply feedback with
-- app_slug = 'platform', which is what collapsed the two code paths the old
-- `clientId is null XOR topicId is null` check used to distinguish.
create or replace function "platform".submit_feedback(
  app_slug text,
  feedback_type "platform"."feedbackType",
  title text,
  description text,
  topic_id uuid default null,
  severity "platform"."feedbackSeverity" default null,
  browser_metadata jsonb default null
)
returns jsonb
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

  return jsonb_build_object('feedbackId', new_id);
end;
$$;

-- The caller's own reports, newest first.
--
-- The outcome is deliberately coarse. A reporter learns whether their report
-- led to action, not what happened to the other user -- another member's
-- standing is not the reporter's business, and the console has the full record
-- for anyone who is entitled to it. "moderatorNote" is internal and never
-- appears here.
--
-- The snapshot comes back only for content whose type is marked public.
-- Anything else -- including a type that has since been dropped, which resolves
-- to no row at all -- withholds it.
create or replace function "platform".my_reports(app_slug text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row order by row ->> 'createdAt' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'reportId',    r."id",
      'appSlug',     a."slug",
      'contentType', r."contentType",
      'contentRef',  r."contentRef",
      'contentUrl',  r."contentUrl",
      'snapshot',    case when c."visibility" = 'public' then r."contentSnapshot" end,
      'reason',      rr."title",
      'description', r."description",
      'status',      r."status",
      'createdAt',   r."createdAt",
      'resolvedAt',  r."resolvedAt",
      'outcome',     case
                       when r."status" = 'open' then null
                       when r."status" = 'dismissed' then 'dismissed'
                       when res."subjectAction" <> 'no_action'
                         or res."contentAction" <> 'no_action' then 'action_taken'
                       else 'no_violation'
                     end,
      'contentRemoved', coalesce(res."contentAction" = 'quarantine', false)
    ) as row
    from "platform"."reports" r
    join "platform"."apps" a on a."id" = r."appId"
    join "platform"."reportReasons" rr on rr."id" = r."reasonId"
    left join "platform"."reportResolutions" res on res."reportId" = r."id"
    left join "platform".content_types() c
      on c."appId" = r."appId" and c."contentType" = r."contentType"
    where r."reporterUserId" = (select auth.uid())
      and (app_slug is null or a."slug" = app_slug)
  ) s;
$$;

-- The decided subset of my_reports(), for an app that wants to tell a reporter
-- something happened without listing everything they have ever filed. `since`
-- makes polling cheap.
create or replace function "platform".report_outcomes(
  app_slug text default null,
  since timestamp without time zone default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row), '[]'::jsonb)
  from jsonb_array_elements("platform".my_reports(app_slug)) as e(row)
  where row ->> 'status' <> 'open'
    and (since is null or (row ->> 'resolvedAt')::timestamp > since);
$$;
