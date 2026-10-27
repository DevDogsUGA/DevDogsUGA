CREATE TABLE "platform"."reportResolutions" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "reportId"        uuid                        NOT NULL,
  "moderatorUserId" uuid,
  "appliedGlobally" boolean                     NOT NULL DEFAULT false,
  "moderatorNote"   text,
  "createdAt"       timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reportResolutions_moderatorUserId_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "reportResolutions_pkey" PRIMARY KEY (id),
  CONSTRAINT "reportResolutions_reportId_key" UNIQUE ("reportId"),
  CONSTRAINT "reportResolutions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES platform.reports(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."reportResolutions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."reportResolutions"
  ADD COLUMN "contentAction" platform."contentAction" NOT NULL;

ALTER TABLE "platform"."reportResolutions"
  ADD COLUMN "filerAction" platform."filerAction" NOT NULL;

ALTER TABLE "platform"."reportResolutions"
  ADD COLUMN "subjectAction" platform."subjectAction" NOT NULL;

CREATE TRIGGER "reportResolutions_append_audit_event"
  AFTER INSERT ON platform."reportResolutions"
  FOR EACH ROW
  EXECUTE FUNCTION platform.audit_report_resolved();

CREATE POLICY "no_client_delete" ON "platform"."reportResolutions"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reportResolutions"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reportResolutions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "reporter_or_moderator_select" ON "platform"."reportResolutions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM platform.reports r
  WHERE
    ((r.id = "reportResolutions"."reportId") AND ((r."reporterUserId" = ( SELECT auth.uid() AS uid)) OR platform.has_permission(( SELECT auth.uid() AS uid),
    'canModerate'::text))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reportResolutions" TO "anon", "authenticated", "postgres", "service_role";
