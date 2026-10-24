-- Keeps one member's "Workshop completed" badge for one workshop definition in
-- step with the evidence (Q93, Q99): attendance at a live meeting running that
-- workshop, plus a submitted reflection that selects it. Awards when the
-- evidence exists, re-points the evidence when its meeting stopped qualifying
-- but another night still does, and withdraws when none does. Idempotent; the
-- triggers on attendance and reflections call it so every write path agrees.
CREATE OR REPLACE FUNCTION platform.sync_workshop_badge (
  p_user uuid,
  p_definition text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_valid uuid[];
  v_award_id uuid;
  v_award_meeting uuid;
  v_new_id uuid;
begin
  if p_definition is null
     or not exists (select 1 from auth.users u where u.id = p_user) then
    return;
  end if;

  select array_agg(q."meetingId" order by q."startsAt", q."meetingId")
    into v_valid
    from (
      select r."meetingId", m."startsAt"
        from platform.reflections r
        join platform.attendance a
          on a."userId" = r."userId" and a."meetingId" = r."meetingId"
        join platform.meetings m on m.id = r."meetingId"
       where r."userId" = p_user
         and r."workshopDefinitionId" = p_definition
         and r."submittedAt" is not null
         and m."deletedAt" is null
         and m."cancelledAt" is null
         and exists (
           select 1 from platform.workshops w
            where w."meetingId" = r."meetingId"
              and w."definitionId" = p_definition
              and w."deletedAt" is null)
    ) q;

  select b.id, b."meetingId" into v_award_id, v_award_meeting
    from platform."badgeAwards" b
   where b."userId" = p_user
     and b."badgeId" = 'workshop-completed'
     and b."workshopDefinitionId" = p_definition
     and b."withdrawnAt" is null;

  if v_valid is not null then
    if v_award_id is null then
      insert into platform."badgeAwards"
        ("userId", "badgeId", "workshopDefinitionId", "method", "repeatable", "meetingId")
      values (p_user, 'workshop-completed', p_definition, 'automatic', false, v_valid[1])
      on conflict ("userId", "badgeId", (coalesce("workshopDefinitionId", '')))
        where "withdrawnAt" is null and not "repeatable"
        do nothing
      returning id into v_new_id;
      if v_new_id is not null then
        insert into platform."auditEvents"
          ("actorType", "source", "action", "targetType", "targetId", "metadata")
        values ('system', 'platform', 'badge.awarded', 'badgeAward', v_new_id::text,
          jsonb_build_object('userId', p_user, 'badgeId', 'workshop-completed',
            'workshopDefinitionId', p_definition, 'meetingId', v_valid[1],
            'automatic', true));
      end if;
    elsif v_award_meeting is null or not (v_award_meeting = any (v_valid)) then
      update platform."badgeAwards" set "meetingId" = v_valid[1] where id = v_award_id;
    end if;
  elsif v_award_id is not null then
    update platform."badgeAwards"
       set "withdrawnAt" = now(),
           "withdrawnReason" = 'The attendance or submitted reflection that supported it no longer exists.'
     where id = v_award_id;
    insert into platform."auditEvents"
      ("actorType", "source", "action", "targetType", "targetId", "metadata")
    values ('system', 'platform', 'badge.withdrawn', 'badgeAward', v_award_id::text,
      jsonb_build_object('userId', p_user, 'badgeId', 'workshop-completed',
        'workshopDefinitionId', p_definition, 'automatic', true,
        'meetingId', v_award_meeting));
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."sync_workshop_badge"(uuid, text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."sync_workshop_badge"(uuid, text) FROM PUBLIC;
