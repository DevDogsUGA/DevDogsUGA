-- D7: the projects cutover. Hand-written; CI verifies declarative equality.
--
-- 78 added the new project model beside the old one and held back everything
-- that acts on existing rows. This is that second half: legacy rows are
-- converted, the columns and checks tighten to their final shape, the guards
-- 78 deferred are installed, and the EL evidence view reads commit citations.
-- Production holds one project (the seeded platform row) and no reports, so
-- the conversions below touch nothing there; they are written to be right for
-- any data, because staging and local databases can hold rows.
--
-- Not here, on purpose: platform."projectMembers", platform.contributions,
-- platform."projectReportContributions", the proposal columns
-- ("repos", "proposedBy", "approvedBy", "decidedAt") and "badgeAwards".
-- "contributionId" stay until the contract change, after this deploy.

-- 1. Refuse to start over data the new rules cannot represent. Review has
-- always been someone other than the author (the actions say so), so a row
-- that says otherwise is damage to look at, not to repair silently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform."projectReports" WHERE "reviewedBy" = "userId") THEN
    RAISE EXCEPTION 'projectReports has reports reviewed by their own author; resolve them before applying migration 83';
  END IF;
END
$$;

-- 2. Legacy rows get a slug: the name as lowercase hyphenated words (accents
-- folded, as the app's slugBase does), the oldest project taking the plain
-- form, and any later one that collides (or whose plain form is a reserved
-- docs namespace) taking the first eight hex digits of its id as a suffix.
-- The full id is the last resort.
DO $$
DECLARE
  r record;
  v_base text;
  v_slug text;
  v_reserved constant text[] := ARRAY['platform', 'toolkit', 'workshops', 'schedule-builder', 'operations'];
BEGIN
  FOR r IN SELECT id, name FROM platform.projects WHERE slug IS NULL ORDER BY "createdAt", id LOOP
    v_base := regexp_replace(normalize(lower(r.name), NFKD), '[\u0300-\u036f]', '', 'g');
    v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
    v_base := btrim(left(v_base, 60), '-');
    IF char_length(v_base) < 2 THEN
      v_base := 'project';
    END IF;
    v_slug := v_base;
    IF v_slug = ANY (v_reserved) OR EXISTS (SELECT 1 FROM platform.projects WHERE slug = v_slug) THEN
      v_slug := v_base || '-' || left(replace(r.id::text, '-', ''), 8);
    END IF;
    IF EXISTS (SELECT 1 FROM platform.projects WHERE slug = v_slug) THEN
      v_slug := btrim(left(v_base, 47), '-') || '-' || replace(r.id::text, '-', '');
    END IF;
    UPDATE platform.projects SET slug = v_slug WHERE id = r.id;
  END LOOP;
END
$$;

-- 3. Status. Proposals and refusals have no place in the new model, and a
-- project is active only with an approved repository link (Q25, Q41).
UPDATE platform.projects p
SET status = 'archived', "updatedAt" = now()
WHERE p.status IN ('proposed', 'declined')
   OR (p.status = 'active' AND NOT EXISTS (
     SELECT 1 FROM platform."projectRepos" r
     WHERE r."projectId" = p.id AND r.approval = 'approved'));

-- 4. projects: slug required and plainly unique, two statuses, active by default.
ALTER TABLE platform.projects ALTER COLUMN "slug" SET NOT NULL;

DROP INDEX platform."projects_slug_key";

ALTER TABLE platform.projects ADD CONSTRAINT "projects_slug_key" UNIQUE ("slug");

ALTER TABLE platform.projects DROP CONSTRAINT "projects_status_choices";

ALTER TABLE platform.projects
  ADD CONSTRAINT "projects_status_choices" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));

ALTER TABLE platform.projects ALTER COLUMN "status" SET DEFAULT 'active';

COMMENT ON TABLE "platform"."projects" IS 'Server-only. A long-lived DevDogs project that members can report independent work on for EL credit (Q119, Q123, Q170). Any member creates one from repositories they control (active) or, while every repository waits on an officer, archived. Owners edit it (projectOwners; Officers on a DevDogs-owned one, as a record rule, never as rows); Contributors are derived from stored commits. "advisorId" is the member who reviews its reports. The legacy "repos" strings and proposal columns are read by nothing and drop in the contract change. Account deletion: a project outlives the people on it. A deleted advisor leaves "advisorId" null (ON DELETE SET NULL) so the project is waiting for a new one, not gone; "proposedBy" and "approvedBy" are likewise set null.';

COMMENT ON COLUMN "platform"."projects"."status" IS 'active or archived. Only an active project takes reports. An active project always has at least one approved repository link (a deferred constraint trigger, checked at commit); archive it, never delete one with reports or submissions.';

COMMENT ON COLUMN "platform"."projects"."slug" IS 'The project''s URL segment and docs mount: lowercase hyphenated, 2 to 80 characters, unique. Frozen once docs have published; the reserved docs namespaces are refused (guard_project_structure).';

-- 5. Reports. "legacyEvidence" is the one exemption from the citation minimum:
-- a report filed before commit citations existed has none to give. The
-- migration marks exactly the reports that have no citation now; server code
-- never writes the column, so every later report is held to the rule.
ALTER TABLE platform."projectReports" ADD COLUMN "legacyEvidence" boolean NOT NULL DEFAULT false;

UPDATE platform."projectReports" r
SET "legacyEvidence" = true
WHERE NOT EXISTS (SELECT 1 FROM platform."projectReportCommits" c WHERE c."reportId" = r.id);

ALTER TABLE platform."projectReports"
  ADD CONSTRAINT "projectReports_reviewedBy_not_author" CHECK (("reviewedBy" IS NULL) OR ("reviewedBy" <> "userId"));

COMMENT ON TABLE "platform"."projectReports" IS 'Server-only. A member''s report of independent project work for EL credit: a date range, the actual hours they claim, the commits they cite as evidence (platform."projectReportCommits", at least one, each cited by one report only) and a reflection of at least 100 words. An advisor of the project or any member who may review reports (never the author, a CHECK) approves it, optionally adjusting the hours, or returns it with a note; the author can then edit and resubmit. Only approved hours reach the EL evidence export. Account deletion: the member''s reports are deleted with the account (ON DELETE CASCADE, Q168) because EL evidence goes to UGAHacks through officer exports; "reviewedBy" is set null when the reviewer''s account goes. Hours already credited to a workshop must not be claimed again; the reviewer checks.';

COMMENT ON COLUMN "platform"."projectReports"."legacyEvidence" IS 'True for a report filed before commit citations, which has none and is exempt from the citation minimum. Set once by migration 83 and never by server code; a report with it set has no commits, so it is not EL evidence either (platform."memberElEvidence" needs a citation). Dropped with the legacy pull-request tables.';

-- 6. The deferred guards. Both are constraint triggers evaluated at commit, so
-- a transaction may create a project and link its repo, or replace a report's
-- citations, in any order. Deleting the row (a cascade included) makes the
-- check a no-op: it looks the row up again and finds nothing.

-- An active project has at least one approved repository link.
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

CREATE CONSTRAINT TRIGGER projects_require_approved_repo
  AFTER INSERT OR UPDATE OF status ON platform."projects"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_approved_repo();

CREATE CONSTRAINT TRIGGER projectRepos_require_approved_repo
  AFTER UPDATE OR DELETE ON platform."projectRepos"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_approved_repo();

-- A report has at least one citation, and a change of its author, project or
-- dates leaves every citation eligible. Run from the report (any insert or
-- update) and from its citations (a delete or a move to another report). The
-- report row is locked, so two transactions each removing one of two citations
-- cannot both pass. The eligibility test is validate_report_commit's, and only
-- a change to author, project or dates repeats it: a later transfer or health
-- change of a repository never invalidates a citation already accepted.
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

CREATE CONSTRAINT TRIGGER projectReports_require_commits
  AFTER INSERT OR UPDATE ON platform."projectReports"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_report_commits();

CREATE CONSTRAINT TRIGGER projectReportCommits_require_commits
  AFTER DELETE OR UPDATE OF "reportId" ON platform."projectReportCommits"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_report_commits();

-- 7. EL evidence. The workshop branch is unchanged. A project report counts
-- when it is approved and cites at least one commit; EXISTS, not a join, so a
-- report with many commits is still one row and its hours are counted once.
CREATE OR REPLACE VIEW "platform"."memberElEvidence" WITH (security_invoker=on) AS  SELECT w."userId",
    'workshop'::text AS "evidenceType",
    w."reflectionId" AS "evidenceId",
    w."meetingId",
    NULL::uuid AS "projectId",
    w.title,
    w."activityOn",
    w.hours,
    w.words
   FROM ( SELECT DISTINCT ON (r."userId", r."workshopDefinitionId") r."userId",
            r.id AS "reflectionId",
            m.id AS "meetingId",
            COALESCE(ws.title, ws.project, ws."definitionId") AS title,
            ((m."startsAt" AT TIME ZONE 'America/New_York'::text))::date AS "activityOn",
            ws."elHours" AS hours,
            platform.word_count(r.content) AS words
           FROM ((((platform.reflections r
             JOIN platform.attendance a ON (((a."userId" = r."userId") AND (a."meetingId" = r."meetingId"))))
             JOIN platform.meetings m ON (((m.id = r."meetingId") AND (m."cancelledAt" IS NULL) AND (m."deletedAt" IS NULL))))
             JOIN platform.workshops ws ON (((ws."meetingId" = m.id) AND (ws."definitionId" = r."workshopDefinitionId") AND (ws."deletedAt" IS NULL))))
             CROSS JOIN platform."reflectionSettings" s)
          WHERE ((r."submittedAt" IS NOT NULL) AND (r."workshopDefinitionId" IS NOT NULL) AND (platform.word_count(r.content) >= GREATEST(s."minimumWordCount", 100)) AND (r."submittedAt" <= (GREATEST(m."endsAt", a."recordedAt") + make_interval(days => GREATEST(s."submissionWindowDays", 7)))))
          ORDER BY r."userId", r."workshopDefinitionId", m."startsAt", r.id) w
UNION ALL
 SELECT pr."userId",
    'project_report'::text AS "evidenceType",
    pr.id AS "evidenceId",
    NULL::uuid AS "meetingId",
    pr."projectId",
    p.name AS title,
    pr."endDate" AS "activityOn",
    pr."approvedHours" AS hours,
    platform.word_count(pr.content) AS words
   FROM (platform."projectReports" pr
     JOIN platform.projects p ON ((p.id = pr."projectId")))
  WHERE ((pr.status = 'approved'::text) AND (pr."approvedHours" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM platform."projectReportCommits" c
          WHERE (c."reportId" = pr.id))));

COMMENT ON VIEW "platform"."memberElEvidence" IS 'Server-only. The EL (experiential learning) evidence the club can vouch for, one row per item: a workshop (the member attended a meeting that ran it, submitted a qualifying reflection naming it, at least 100 words and inside a window of at least one week (never less, whatever the setting) from when attendance was recorded or the meeting ended, whichever is later; hours are the workshop definition''s elHours copied onto platform.workshops) or an approved project report that cites at least one commit (hours the reviewer confirmed; a report from before commit citations has none and is not counted). A workshop counts once per member even if it ran on several nights. Read by the /attendance summary and by the officers'' EL evidence export, so both agree on what is verified. Account deletion: the view holds nothing of its own; it empties as the member''s reflections, attendance and reports go.';
