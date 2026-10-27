-- The one credit rule (Q165): a meeting counts for stars, streaks,
-- reflections and EL credit when it links at least one live reusable
-- workshop definition. Every reader calls this rather than repeating it.
CREATE OR REPLACE FUNCTION platform.meeting_has_workshop (
  meeting_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from "platform"."workshops" w
    where w."meetingId" = meeting_id
      and w."definitionId" is not null
      and w."deletedAt" is null
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."meeting_has_workshop"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."meeting_has_workshop"(uuid) FROM PUBLIC;
