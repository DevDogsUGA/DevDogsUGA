CREATE OR REPLACE FUNCTION platform.badges_after_commit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid;
begin
  if tg_table_name = 'repoCommits' then
    select "userId" into v_user from platform.commits where sha = new.sha;
  else v_user := new."userId"; end if;
  perform platform.award_first_commit(v_user);
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.badges_after_commit() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.badges_after_commit() FROM PUBLIC, "anon", "authenticated";
