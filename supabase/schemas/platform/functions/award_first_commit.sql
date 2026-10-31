CREATE OR REPLACE FUNCTION platform.award_first_commit(p_user uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_sha text;
  v_id uuid;
begin
  if p_user is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-commit:' || p_user::text, 0));
  select c.sha into v_sha from platform.commits c
  where c."userId" = p_user and exists (select 1 from platform."repoCommits" rc where rc.sha = c.sha)
  order by c."committedAt", c.sha limit 1;
  if v_sha is null then return; end if;
  if exists (select 1 from platform."badgeAwards" where "userId" = p_user and "badgeId" = 'first-commit') then
    -- A later backfill can discover older evidence, but never reactivate a
    -- withdrawn award, alter a manual award, or change its date/visibility.
    update platform."badgeAwards" set "commitSha" = v_sha
    where "userId" = p_user and "badgeId" = 'first-commit'
      and method = 'automatic' and "withdrawnAt" is null;
    return;
  end if;
  insert into platform."badgeAwards" ("userId", "badgeId", method, repeatable, "commitSha")
  values (p_user, 'first-commit', 'automatic', false, v_sha)
  on conflict ("userId", "badgeId", (coalesce("workshopDefinitionId", '')))
    where "withdrawnAt" is null and not repeatable do nothing returning id into v_id;
  if v_id is not null then
    insert into platform."auditEvents" ("actorType", source, action, "targetType", "targetId", metadata)
    values ('system', 'platform', 'badge.awarded', 'badgeAward', v_id::text,
      jsonb_build_object('userId', p_user, 'badgeId', 'first-commit', 'commitSha', v_sha, 'automatic', true));
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.award_first_commit(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.award_first_commit(uuid) FROM PUBLIC, "anon", "authenticated";
