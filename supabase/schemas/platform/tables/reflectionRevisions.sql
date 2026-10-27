CREATE TABLE "platform"."reflectionRevisions" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reflectionId"    uuid                     NOT NULL,
  "userId"          uuid                     NOT NULL,
  "meetingId"       uuid                     NOT NULL,
  "content"         text                     NOT NULL,
  "submittedAt"     timestamp with time zone,
  "createdAt"       timestamp with time zone NOT NULL DEFAULT now(),
  "createdByUserId" uuid                     NOT NULL,
  "changeReason"    text,
  CONSTRAINT "reflectionRevisions_changeReason_length" CHECK ((("changeReason" IS NULL) OR (char_length("changeReason") <= 500))),
  CONSTRAINT "reflectionRevisions_pkey" PRIMARY KEY (id),
  CONSTRAINT "reflectionRevisions_reflectionId_fkey" FOREIGN KEY ("reflectionId") REFERENCES platform.reflections(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."reflectionRevisions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "reflectionRevisions_reflectionId_createdAt_idx" ON platform."reflectionRevisions" USING btree ("reflectionId", "createdAt" DESC);

CREATE INDEX "reflectionRevisions_userId_createdAt_idx" ON platform."reflectionRevisions" USING btree ("userId", "createdAt" DESC);

CREATE TRIGGER "reflectionRevisions_append_only"
  BEFORE DELETE OR UPDATE ON platform."reflectionRevisions"
  FOR EACH ROW
  EXECUTE FUNCTION platform.reject_reflection_revision_mutation();

CREATE POLICY "no_client_delete" ON "platform"."reflectionRevisions"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reflectionRevisions"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reflectionRevisions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "own_or_auditor_select" ON "platform"."reflectionRevisions"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "userId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reflectionRevisions" TO "anon", "authenticated", "postgres", "service_role";
