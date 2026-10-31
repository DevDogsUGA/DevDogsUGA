CREATE OR REPLACE FUNCTION platform.guard_project_structure()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_project uuid;
begin
  if tg_table_name = 'projects' then
    if tg_op = 'DELETE' then
      if old."devdogsOwned"
         or exists (select 1 from platform."projectReports" where "projectId" = old.id)
         or exists (select 1 from platform.submissions where "projectId" = old.id) then
        raise exception 'Project cannot be deleted';
      end if;
      return old;
    end if;
    if tg_op = 'UPDATE' then
      if old."docsFirstPublishedAt" is not null and
         (new.slug is distinct from old.slug or new."docsFirstPublishedAt" is distinct from old."docsFirstPublishedAt") then
        raise exception 'Published docs slug and first publication are immutable';
      end if;
      if old."devdogsOwned" and not new."devdogsOwned" then
        raise exception 'DevDogs ownership is irreversible';
      end if;
      if new.slug is distinct from old.slug and exists (
        select 1 from platform."projectDocsProposals" where "projectId" = old.id and state in ('opening','open')
      ) then raise exception 'Docs proposal freezes slug'; end if;
    end if;
    if new.slug is not null and (tg_op = 'INSERT' or new.slug is distinct from old.slug) then
      if char_length(new.slug) not between 2 and 80 or new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception 'Invalid project slug';
      end if;
      if new.slug in ('toolkit','workshops','schedule-builder','operations') or
         (new.slug = 'platform' and lower(btrim(new.name)) <> 'devdogs platform') then
        raise exception 'Reserved project slug';
      end if;
    end if;
    if new."docsRepoId" is not null and not exists (
      select 1 from platform."projectRepos" where "projectId" = new.id
      and "githubRepoId" = new."docsRepoId" and approval = 'approved'
    ) then raise exception 'Docs repository must be an approved project link'; end if;
    return new;
  end if;

  -- Every link/owner write locks the parent, serializing the ten-link limit.
  if tg_op = 'UPDATE' and new."projectId" is distinct from old."projectId" then
    raise exception 'Replace links instead of moving them between projects';
  end if;
  v_project := case when tg_op = 'DELETE' then old."projectId" else new."projectId" end;
  perform 1 from platform.projects where id = v_project for update;
  if tg_table_name = 'projectRepos' then
    if tg_op = 'INSERT' and (select count(*) from platform."projectRepos" where "projectId" = v_project) >= 10 then
      raise exception 'At most ten project repository links';
    end if;
    if tg_op in ('DELETE','UPDATE') then
      if exists (select 1 from platform.projects where id = v_project and "docsRepoId" = old."githubRepoId")
         and (tg_op = 'DELETE' or new."githubRepoId" <> old."githubRepoId" or new.approval <> 'approved') then
        raise exception 'Cannot remove the docs repository link';
      end if;
      if (tg_op = 'DELETE' or new."githubRepoId" <> old."githubRepoId") and exists (
        select 1 from platform."projectReportCommits" pc join platform."projectReports" r on r.id = pc."reportId"
        where r."projectId" = v_project and pc."githubRepoId" = old."githubRepoId"
      ) then raise exception 'Repository link supports report citations'; end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.guard_project_structure() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.guard_project_structure() FROM PUBLIC, "anon", "authenticated";
