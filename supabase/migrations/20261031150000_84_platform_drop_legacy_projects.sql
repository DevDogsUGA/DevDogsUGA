-- D10: the contract. Hand-written; CI verifies declarative equality.
--
-- Drops what the project, contribution and member-list redesign left behind:
-- the pull-request evidence tables, the stored project member list and the
-- proposal columns on projects. 83 stopped anything depending on them and the
-- platform release before this one retired their last readers and writers
-- (nothing in the app touches any of them), so this ships after that deploy.
-- Production held no rows in any of them (read-only counts, 2026-10-31).
--
-- Kept on purpose: platform."projectReports"."legacyEvidence" and its
-- exemption in require_report_commits(). Nothing else references what is
-- dropped here: 81 already dropped the triggers and functions on contributions
-- and auth.identities, and platform."memberElEvidence" (rebuilt in 83) reads
-- projects.name, never the dropped columns.

-- 1. badgeAwards no longer points at a merged pull request. The foreign key
-- goes with the column; it must go before the table it references.
ALTER TABLE platform."badgeAwards" DROP CONSTRAINT "badgeAwards_contributionId_fkey";

ALTER TABLE platform."badgeAwards" DROP COLUMN "contributionId";

-- 2. The pull requests a report cited, then the pull requests themselves.
-- Dropping a table removes its policies, indexes and constraints.
DROP TABLE platform."projectReportContributions";

DROP TABLE platform.contributions;

-- 3. The stored member list. Owners are projectOwners; contributors are
-- derived from stored commits.
DROP TABLE platform."projectMembers";

-- 4. The legacy repository strings and the proposal columns on projects. The
-- repository links are platform."projectRepos".
ALTER TABLE platform.projects DROP CONSTRAINT "projects_repos_count";

ALTER TABLE platform.projects DROP CONSTRAINT "projects_approvedBy_fkey";

ALTER TABLE platform.projects DROP CONSTRAINT "projects_proposedBy_fkey";

ALTER TABLE platform.projects
  DROP COLUMN "repos",
  DROP COLUMN "proposedBy",
  DROP COLUMN "approvedBy",
  DROP COLUMN "decidedAt";

-- 5. Comments that described what is gone.
COMMENT ON TABLE "platform"."projects" IS 'Server-only. A long-lived DevDogs project that members can report independent work on for EL credit (Q119, Q123, Q170). Any member creates one from repositories they control (active) or, while every repository waits on an officer, archived. Owners edit it (projectOwners; Officers on a DevDogs-owned one, as a record rule, never as rows); Contributors are derived from stored commits. "advisorId" is the member who reviews its reports. Account deletion: a project outlives the people on it. A deleted advisor leaves "advisorId" null (ON DELETE SET NULL) so the project is waiting for a new one, not gone.';

COMMENT ON COLUMN "platform"."projects"."advisorId" IS 'The member who reviews the project''s reports. Null until leadership assigns one, and again after the advisor''s account is deleted.';

COMMENT ON COLUMN "platform"."projectReports"."legacyEvidence" IS 'True for a report filed before commit citations, which has none and is exempt from the citation minimum. Set once by migration 83 and never by server code; a report with it set has no commits, so it is not EL evidence either (platform."memberElEvidence" needs a citation). The pull-request tables it stood for were dropped in migration 84.';
