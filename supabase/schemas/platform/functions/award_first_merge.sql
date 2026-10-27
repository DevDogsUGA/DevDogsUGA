-- Awards a member's First Merge badge once, on their earliest matched merged
-- pull request. Never again after the first row exists, withdrawn or not: an
-- officer who withdrew it meant it. Idempotent.
CREATE OR REPLACE FUNCTION platform.award_first_merge (
  p_user uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_contribution uuid;
  v_new_id uuid;
begin
  if p_user is null
     or exists (select 1 from platform."badgeAwards" b
                 where b."userId" = p_user and b."badgeId" = 'first-merge') then
    return;
  end if;

  select c.id into v_contribution
    from platform.contributions c
   where c."userId" = p_user
   order by c."mergedAt", c.id
   limit 1;
  if v_contribution is null then
    return;
  end if;

  insert into platform."badgeAwards"
    ("userId", "badgeId", "method", "repeatable", "contributionId")
  values (p_user, 'first-merge', 'automatic', false, v_contribution)
  on conflict ("userId", "badgeId", (coalesce("workshopDefinitionId", '')))
    where "withdrawnAt" is null and not "repeatable"
    do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    insert into platform."auditEvents"
      ("actorType", "source", "action", "targetType", "targetId", "metadata")
    values ('system', 'platform', 'badge.awarded', 'badgeAward', v_new_id::text,
      jsonb_build_object('userId', p_user, 'badgeId', 'first-merge',
        'contributionId', v_contribution, 'automatic', true));
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."award_first_merge"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."award_first_merge"(uuid) FROM PUBLIC;
