CREATE TABLE "platform"."reports" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "appId"           uuid                        NOT NULL,
  "reporterUserId"  uuid,
  "reportedUserId"  uuid,
  "contentType"     text                        NOT NULL,
  "contentRef"      text                        NOT NULL,
  "contentSnapshot" character varying(5000)     NOT NULL,
  "contentUrl"      text,
  "description"     character varying(1000),
  "createdAt"       timestamp without time zone NOT NULL DEFAULT now(),
  "resolvedAt"      timestamp without time zone,
  CONSTRAINT "reports_appId_fkey" FOREIGN KEY ("appId") REFERENCES platform.apps(id) ON DELETE CASCADE,
  CONSTRAINT "reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "platform"."reports"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."reports"
  ADD COLUMN "reason" platform."reportReason" NOT NULL;

ALTER TABLE "platform"."reports"
  ADD COLUMN "status" platform."reportStatus" NOT NULL DEFAULT 'open'::platform."reportStatus";

CREATE UNIQUE INDEX reports_open_content_idx ON platform.reports USING btree ("appId", "contentType", "contentRef")
  WHERE (status = 'open'::platform."reportStatus");

CREATE INDEX reports_status_idx ON platform.reports USING btree (status);

CREATE TRIGGER reports_append_audit_event
  AFTER INSERT ON platform.reports
  FOR EACH ROW
  EXECUTE FUNCTION platform.audit_report_created();

CREATE POLICY "no_client_delete" ON "platform"."reports"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reports"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reports"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "reporter_or_moderator_select" ON "platform"."reports"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "reporterUserId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reports" TO "anon", "authenticated", "postgres", "service_role";
