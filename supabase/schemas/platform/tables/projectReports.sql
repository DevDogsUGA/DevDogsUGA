CREATE TABLE "platform"."projectReports" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"        uuid                     NOT NULL,
  "projectId"     uuid                     NOT NULL,
  "startDate"     date                     NOT NULL,
  "endDate"       date                     NOT NULL,
  "hours"         numeric(5,2)             NOT NULL,
  "content"       text                     NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'submitted',
  "approvedHours" numeric(5,2),
  "reviewedBy"    uuid,
  "reviewedAt"    timestamp with time zone,
  "reviewNote"    text,
  "submittedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectReports_approved_shape" CHECK ((((status = 'approved') = ("approvedHours" IS NOT NULL)) AND ((status = 'submitted') = ("reviewedAt" IS NULL)))),
  CONSTRAINT "projectReports_approvedHours_range" CHECK ((("approvedHours" IS NULL) OR (("approvedHours" > (0)::numeric) AND ("approvedHours" <= (200)::numeric)))),
  CONSTRAINT "projectReports_content_words" CHECK ((platform.word_count(content) >= 100)),
  CONSTRAINT "projectReports_dates_order" CHECK (("endDate" >= "startDate")),
  CONSTRAINT "projectReports_hours_range" CHECK ((("hours" > (0)::numeric) AND ("hours" <= (200)::numeric))),
  CONSTRAINT "projectReports_pkey" PRIMARY KEY (id),
  CONSTRAINT "projectReports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES platform.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "projectReports_returned_note" CHECK (((status <> 'returned') OR (char_length(btrim(COALESCE("reviewNote", ''::text))) > 0))),
  CONSTRAINT "projectReports_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projectReports_status_choices" CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'returned'::text]))),
  CONSTRAINT "projectReports_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."projectReports"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "projectReports_userId_idx" ON platform."projectReports" USING btree ("userId", "submittedAt" DESC);

CREATE INDEX "projectReports_projectId_status_idx" ON platform."projectReports" USING btree ("projectId", status);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectReports" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectReports" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."projectReports" IS 'Server-only. A member''s report of independent project work for EL credit: a date range, the actual hours they claim, merged pull requests as evidence (platform."projectReportContributions") and a reflection of at least 100 words. An advisor of the project or any leadership member (never the author) approves it, optionally adjusting the hours, or returns it with a note; the author can then edit and resubmit. Only approved hours reach the EL evidence export. Account deletion: the member''s reports are deleted with the account (ON DELETE CASCADE, Q168) because EL evidence goes to UGAHacks through officer exports; "reviewedBy" is set null when the reviewer''s account goes. Hours already credited to a workshop must not be claimed again; the reviewer checks.';

COMMENT ON COLUMN "platform"."projectReports"."hours" IS 'The hours the member claims, actual participation, in quarter-hour steps by convention (not enforced).';

COMMENT ON COLUMN "platform"."projectReports"."approvedHours" IS 'Set exactly when status is approved: the hours the reviewer confirmed or adjusted. This, not "hours", is what the evidence export counts.';
