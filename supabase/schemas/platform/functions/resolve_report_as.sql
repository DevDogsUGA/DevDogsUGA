CREATE OR REPLACE FUNCTION platform.resolve_report_as (
  actor          uuid,
  report_id      uuid,
  subject_action platform."subjectAction",
  filer_action   platform."filerAction",
  content_action platform."contentAction",
  moderator_note text                     DEFAULT NULL::text,
  apply_globally boolean                  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  report     record;
  app_slug   text;
  resolution uuid;
  external   boolean;
  reason_txt text;
  scope_app  uuid;
  deliveries uuid[] := '{}';
begin
  if actor is null then
    raise exception 'resolve_report() requires a moderator';
  end if;
  if not "platform".has_permission(actor, 'canModerate') then
    raise exception 'resolve_report() requires the canModerate permission';
  end if;

  select r.*, a."slug" as slug, a."kind" as app_kind into report
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
  external := report.app_kind = 'external';

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

  if external then
    -- The app's rows are in another database: record the decision and owe the
    -- app a signed message. Quarantine is a hide; restore is a separate action.
    if content_action = 'quarantine' then
      deliveries := deliveries || "platform".enqueue_moderation_delivery(
        report."appId",
        'content.hide',
        jsonb_build_object(
          'contentType', report."contentType",
          'contentRef',  report."contentRef",
          'reportId',    report_id
        ),
        report_id
      );
    end if;
  else
    -- Inside the same transaction as the decision, and raises rather than
    -- no-oping, so a content action that cannot be applied aborts the whole
    -- resolution instead of recording an outcome that silently never landed.
    perform "platform".apply_content_action(
      app_slug, report."contentType", report."contentRef", content_action, resolution
    );
  end if;

  -- A deleted member's id on the report is null: there is nobody to act on.
  if coalesce(apply_globally, false) then
    if subject_action in ('suspend', 'ban') and report."reportedUserId" is not null then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reportedUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;

    if filer_action = 'suspend' and report."reporterUserId" is not null then
      insert into "platform"."userSuspensions" ("userId", "service", "suspendedBy")
      values (report."reporterUserId", 'global', actor)
      on conflict ("userId", "service") do update
        set "suspendedBy" = actor, "suspendedAt" = now();
    end if;
  end if;

  -- Standing changes reach every external app when global, and the reported
  -- app alone otherwise. The reason is the report's category, never the
  -- moderator's private note.
  if (subject_action in ('suspend', 'ban') or filer_action = 'suspend')
     and (coalesce(apply_globally, false) or external) then
    reason_txt := report."reason"::text;
    scope_app := case when coalesce(apply_globally, false) then null else report."appId" end;

    if subject_action in ('suspend', 'ban') and report."reportedUserId" is not null then
      deliveries := deliveries || "platform".enqueue_user_standing(
        report."reportedUserId", subject_action::text, reason_txt, report_id, scope_app
      );
    end if;
    if filer_action = 'suspend' and report."reporterUserId" is not null then
      deliveries := deliveries || "platform".enqueue_user_standing(
        report."reporterUserId", 'suspend', reason_txt, report_id, scope_app
      );
    end if;
  end if;

  return jsonb_build_object(
    'resolutionId', resolution,
    -- Non-null only when Supabase's native ban still has to be applied by a
    -- caller with admin credentials.
    'bannedUserId', case
      when coalesce(apply_globally, false) and subject_action = 'ban'
        and report."reportedUserId" is not null
      then report."reportedUserId"
    end,
    -- The deliveries this decision owes that are ready to send, for the caller
    -- to queue once the transaction has committed. One already marked failed
    -- (its app has no endpoint) waits for a person and a resend instead.
    'deliveryIds', (
      select coalesce(jsonb_agg(d."id" order by d."createdAt", d."id"), '[]'::jsonb)
      from "platform"."moderationDeliveries" d
      where d."id" = any(deliveries) and d."status" = 'pending'
    )
  );
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "platform"."resolve_report_as"(uuid, uuid, platform."subjectAction", platform."filerAction", platform."contentAction", text, boolean)
  TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."resolve_report_as"(uuid, uuid, platform."subjectAction", platform."filerAction", platform."contentAction", text, boolean) FROM PUBLIC;
