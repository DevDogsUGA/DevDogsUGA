-- Trigger bodies that call the two award functions in the same transaction as
-- the write that changes the evidence. Each is a thin wrapper so the rule
-- lives in sync_workshop_badge / award_first_merge alone.

CREATE OR REPLACE FUNCTION platform.badges_after_contribution ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new."userId" is not null then
    perform platform.award_first_merge(new."userId");
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.badges_after_attendance ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid;
  v_meeting uuid;
  v_definition text;
begin
  if tg_op = 'DELETE' then
    v_user := old."userId";
    v_meeting := old."meetingId";
  else
    v_user := new."userId";
    v_meeting := new."meetingId";
  end if;
  if v_user is null then
    return null;
  end if;
  for v_definition in
    select distinct r."workshopDefinitionId"
      from platform.reflections r
     where r."userId" = v_user and r."meetingId" = v_meeting
       and r."workshopDefinitionId" is not null
  loop
    perform platform.sync_workshop_badge(v_user, v_definition);
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.badges_after_reflection ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'DELETE' then
    if old."meetingId" is not null then
      perform platform.sync_workshop_badge(old."userId", old."workshopDefinitionId");
    end if;
    return null;
  end if;
  if new."meetingId" is not null then
    perform platform.sync_workshop_badge(new."userId", new."workshopDefinitionId");
  end if;
  if tg_op = 'UPDATE' and old."meetingId" is not null
     and old."workshopDefinitionId" is distinct from new."workshopDefinitionId" then
    perform platform.sync_workshop_badge(old."userId", old."workshopDefinitionId");
  end if;
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."badges_after_contribution"() TO "postgres", "service_role";
GRANT EXECUTE ON FUNCTION "platform"."badges_after_attendance"() TO "postgres", "service_role";
GRANT EXECUTE ON FUNCTION "platform"."badges_after_reflection"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."badges_after_contribution"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "platform"."badges_after_attendance"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "platform"."badges_after_reflection"() FROM PUBLIC;
