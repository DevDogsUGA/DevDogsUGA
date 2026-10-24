CREATE TABLE "platform"."projectReportContributions" (
  "reportId"       uuid NOT NULL,
  "contributionId" uuid NOT NULL,
  CONSTRAINT "projectReportContributions_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES platform.contributions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "projectReportContributions_contributionId_key" UNIQUE ("contributionId"),
  CONSTRAINT "projectReportContributions_pkey" PRIMARY KEY ("reportId", "contributionId"),
  CONSTRAINT "projectReportContributions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES platform."projectReports"(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."projectReportContributions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectReportContributions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectReportContributions" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."projectReportContributions" IS 'Server-only. The merged pull requests (platform.contributions) a project report cites as evidence. A pull request belongs to at most one report (UNIQUE on "contributionId"), so the same work cannot be claimed twice; deleting a report frees its pull requests. The server checks that each one is the report author''s own and was merged inside the report''s date range. Account deletion: rows go with the report (ON DELETE CASCADE from "reportId") and with the contribution (ON DELETE CASCADE), so deleting the account removes them either way.';
