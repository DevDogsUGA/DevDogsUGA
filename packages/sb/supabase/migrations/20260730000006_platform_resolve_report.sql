-- Resolving a report, as one function both callers share.
--
-- Until now this lived in `server/actions/moderation.ts` -- fine while the only
-- moderation surface was the console, reading its own database through Drizzle
-- as the `postgres` role. The contributor tooling breaks that assumption: it
-- runs in a browser on devdogsuga.org and acts on a *different* instance, so a
-- server action on this one cannot reach it.
--
-- The alternative was a second implementation of the same workflow for the
-- tools, which is exactly what the retired `OAuthReports` component was, and it
-- had already drifted from the real one (it hard-coded appliedGlobally = false
-- and hand-delivered a webhook payload from the browser). One function, called
-- by both, is what stops that happening again.
--
-- Supabase's native ban cannot be applied from SQL, so it is the one piece that
-- stays with the caller: `bannedUserId` comes back non-null when the decision
-- calls for one, and a caller holding admin credentials finishes the job. A
-- caller without them -- the browser tooling -- still records a correct decision
-- and a suspension, which is what every app's write policies actually consult.

-- ============================================================
-- The decision
-- ============================================================

-- Takes the moderator explicitly rather than reading auth.uid(), because the
-- console reaches this through Drizzle as the `postgres` role, where there is no
-- JWT to read one from.
--
-- That makes it impersonation-capable, so execute is revoked from clients
-- below and the public entry point underneath supplies auth.uid() itself.
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

-- Impersonation-capable: they take the moderator as an argument. Only reachable
-- by the service role and by `postgres`, which is what the console connects as.
-- `from public, anon, authenticated` -- all three matter, see the note in
-- 20260730000002_platform_content_types.sql.
revoke execute on function "platform".resolve_report_as(
  uuid, uuid, "platform"."subjectAction", "platform"."filerAction",
  "platform"."contentAction", text, boolean
) from public, anon, authenticated;

revoke execute on function "platform".dismiss_report_as(uuid, uuid, text)
  from public, anon, authenticated;

-- ============================================================
-- Public entry points
-- ============================================================

-- What a browser calls. Identical behaviour, except that the moderator is the
-- session rather than an argument.
create or replace function "platform".resolve_report(
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
begin
  return "platform".resolve_report_as(
    (select auth.uid()), report_id, subject_action, filer_action,
    content_action, moderator_note, apply_globally
  );
end;
$$;

create or replace function "platform".dismiss_report(
  report_id uuid,
  moderator_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return "platform".dismiss_report_as((select auth.uid()), report_id, moderator_note);
end;
$$;
