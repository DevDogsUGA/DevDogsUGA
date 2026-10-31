CREATE OR REPLACE FUNCTION platform.require_approved_repo()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_project uuid;
begin
  if tg_table_name = 'projects' then
    v_project := new.id;
  elsif tg_op = 'DELETE' then
    v_project := old."projectId";
  else
    v_project := new."projectId";
  end if;
  if exists (select 1 from platform.projects where id = v_project and status = 'active')
     and not exists (
       select 1 from platform."projectRepos" where "projectId" = v_project and approval = 'approved'
     ) then
    raise exception 'An active project needs at least one approved repository link';
  end if;
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.require_approved_repo() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.require_approved_repo() FROM PUBLIC, "anon", "authenticated";
