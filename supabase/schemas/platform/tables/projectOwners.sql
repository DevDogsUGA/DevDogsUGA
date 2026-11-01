CREATE TABLE "platform"."projectOwners" (
  "projectId" uuid NOT NULL REFERENCES platform."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "addedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "addedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectOwners_pkey" PRIMARY KEY ("projectId", "userId")
);

ALTER TABLE "platform"."projectOwners" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "projectOwners_userId_projectId_idx" ON platform."projectOwners" ("userId", "projectId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectOwners"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectOwners"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectOwners"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectOwners"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectOwners" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectOwners" FROM "anon", "authenticated";

CREATE TRIGGER projectOwners_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projectOwners"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();
