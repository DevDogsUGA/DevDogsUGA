CREATE TABLE "platform"."reportCorroborations" (
  "id"             uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "reportId"       uuid                        NOT NULL,
  "reporterUserId" uuid,
  "description"    character varying(1000),
  "createdAt"      timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reportCorroborations_pkey" PRIMARY KEY (id),
  CONSTRAINT "reportCorroborations_report_reporter_key" UNIQUE ("reportId", "reporterUserId"),
  CONSTRAINT "reportCorroborations_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "reportCorroborations_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES platform.reports(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."reportCorroborations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."reportCorroborations"
  ADD COLUMN "reason" platform."reportReason" NOT NULL;

CREATE TRIGGER "reportCorroborations_append_audit_event"
  AFTER INSERT ON platform."reportCorroborations"
  FOR EACH ROW
  EXECUTE FUNCTION platform.audit_report_corroborated();

CREATE POLICY "corroborator_or_moderator_select" ON "platform"."reportCorroborations"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "reporterUserId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canModerate'::text)));

CREATE POLICY "no_client_delete" ON "platform"."reportCorroborations"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reportCorroborations"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reportCorroborations"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reportCorroborations" TO "anon", "authenticated", "postgres", "service_role";
