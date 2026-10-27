CREATE OR REPLACE FUNCTION platform.enqueue_user_standing (
  p_user     uuid,
  p_action   text,
  p_reason   text,
  p_report   uuid DEFAULT NULL::uuid,
  p_only_app uuid DEFAULT NULL::uuid
)
  RETURNS uuid[]
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  ids uuid[] := '{}';
  app record;
begin
  if p_action not in ('suspend', 'ban', 'restore', 'delete') then
    raise exception 'Unknown user standing action "%"', p_action;
  end if;

  for app in
    select a."id"
    from "platform"."apps" a
    where a."kind" = 'external'
      and (p_only_app is null or a."id" = p_only_app)
    order by a."slug"
  loop
    ids := ids || "platform".enqueue_moderation_delivery(
      app."id",
      'user.' || p_action,
      jsonb_build_object('userId', p_user, 'reason', p_reason, 'reportId', p_report),
      p_report
    );
  end loop;

  return ids;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."enqueue_user_standing"(uuid, text, text, uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."enqueue_user_standing"(uuid, text, text, uuid, uuid) FROM PUBLIC;
