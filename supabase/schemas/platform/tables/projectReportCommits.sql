CREATE TABLE "platform"."projectReportCommits" (
  "reportId" uuid NOT NULL REFERENCES platform."projectReports"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "sha" text NOT NULL REFERENCES platform."commits"("sha") ON UPDATE CASCADE ON DELETE CASCADE,
  "githubRepoId" bigint NOT NULL,
  CONSTRAINT "projectReportCommits_pkey" PRIMARY KEY ("reportId", sha),
  CONSTRAINT "projectReportCommits_sha_key" UNIQUE (sha),
  CONSTRAINT "projectReportCommits_githubRepoId_sha_fkey" FOREIGN KEY ("githubRepoId", sha) REFERENCES platform."repoCommits"("githubRepoId", sha) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."projectReportCommits" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "projectReportCommits_githubRepoId_sha_idx" ON platform."projectReportCommits" ("githubRepoId", sha);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectReportCommits" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectReportCommits" FROM "anon", "authenticated";

CREATE TRIGGER projectReportCommits_validate
  BEFORE INSERT OR UPDATE ON platform."projectReportCommits"
  FOR EACH ROW EXECUTE FUNCTION platform.validate_report_commit();

CREATE CONSTRAINT TRIGGER projectReportCommits_require_commits
  AFTER DELETE OR UPDATE OF "reportId" ON platform."projectReportCommits"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_report_commits();
