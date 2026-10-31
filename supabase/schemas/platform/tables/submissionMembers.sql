CREATE TABLE "platform"."submissionMembers" (
  "submissionId" uuid NOT NULL REFERENCES platform."submissions"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "submissionMembers_pkey" PRIMARY KEY ("submissionId", "userId")
);

ALTER TABLE "platform"."submissionMembers" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "submissionMembers_userId_submissionId_idx" ON platform."submissionMembers" ("userId", "submissionId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."submissionMembers"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."submissionMembers"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."submissionMembers"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."submissionMembers"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."submissionMembers" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."submissionMembers" FROM "anon", "authenticated";
