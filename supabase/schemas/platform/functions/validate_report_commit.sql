CREATE OR REPLACE FUNCTION platform.validate_report_commit()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_report platform."projectReports"%rowtype;
begin
  select * into strict v_report from platform."projectReports" where id = new."reportId" for update;
  perform 1 from platform.projects where id = v_report."projectId" for update;
  if not exists (
    select 1 from platform.commits c
    join platform."repoCommits" rc on rc.sha = c.sha and rc."githubRepoId" = new."githubRepoId"
    join platform."projectRepos" pr on pr."githubRepoId" = rc."githubRepoId" and pr."projectId" = v_report."projectId" and pr.approval = 'approved'
    where c.sha = new.sha and c."userId" = v_report."userId"
      and (c."committedAt" at time zone 'America/New_York')::date between v_report."startDate" and v_report."endDate"
  ) then raise exception 'Commit author, provenance, approved project link or Eastern date is ineligible'; end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.validate_report_commit() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.validate_report_commit() FROM PUBLIC, "anon", "authenticated";
