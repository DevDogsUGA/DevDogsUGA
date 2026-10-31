CREATE OR REPLACE FUNCTION platform.require_report_commits()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_report platform."projectReports"%rowtype;
  v_id uuid;
  v_moved boolean := false;
begin
  if tg_table_name = 'projectReports' then
    v_id := new.id;
  else
    v_id := old."reportId";
  end if;
  select * into v_report from platform."projectReports" where id = v_id for update;
  if not found or v_report."legacyEvidence" then
    return null;
  end if;
  if not exists (select 1 from platform."projectReportCommits" where "reportId" = v_report.id) then
    raise exception 'A report needs at least one cited commit';
  end if;
  if tg_table_name = 'projectReports' and tg_op = 'UPDATE' then
    v_moved := new."userId" is distinct from old."userId"
      or new."projectId" is distinct from old."projectId"
      or new."startDate" is distinct from old."startDate"
      or new."endDate" is distinct from old."endDate";
  end if;
  if v_moved and exists (
    select 1 from platform."projectReportCommits" pc
    where pc."reportId" = v_report.id
      and not exists (
        select 1 from platform.commits c
        join platform."repoCommits" rc on rc.sha = c.sha and rc."githubRepoId" = pc."githubRepoId"
        join platform."projectRepos" pr
          on pr."githubRepoId" = rc."githubRepoId" and pr."projectId" = v_report."projectId" and pr.approval = 'approved'
        where c.sha = pc.sha and c."userId" = v_report."userId"
          and (c."committedAt" at time zone 'America/New_York')::date between v_report."startDate" and v_report."endDate"
      )
  ) then
    raise exception 'Commit author, provenance, approved project link or Eastern date is ineligible';
  end if;
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.require_report_commits() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.require_report_commits() FROM PUBLIC, "anon", "authenticated";
