CREATE TABLE "platform"."projectRepos" (
  "projectId" uuid NOT NULL REFERENCES platform."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "githubRepoId" bigint NOT NULL REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  "linkedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "linkedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "approval" text NOT NULL CONSTRAINT "projectRepos_approval_choices" CHECK ("approval" IN ('pending','approved','declined')),
  "approvalBasis" text NOT NULL CONSTRAINT "projectRepos_approvalBasis_choices" CHECK ("approvalBasis" IN ('personal','devdogs-write','officer')),
  "approvedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "decidedAt" timestamp with time zone,
  "approvalOwnerId" bigint NOT NULL CONSTRAINT "projectRepos_approvalOwnerId_positive" CHECK ("approvalOwnerId" > 0),
  CONSTRAINT "projectRepos_pkey" PRIMARY KEY ("projectId", "githubRepoId"),
  CONSTRAINT "projectRepos_decision_shape" CHECK ((approval = 'pending') = ("decidedAt" IS NULL))
);

ALTER TABLE "platform"."projectRepos" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "projectRepos_githubRepoId_projectId_idx" ON platform."projectRepos" ("githubRepoId", "projectId");

CREATE INDEX "projectRepos_linkedAt_idx" ON platform."projectRepos" ("linkedAt") WHERE approval = 'pending';

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectRepos"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectRepos"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectRepos"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectRepos"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectRepos" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectRepos" FROM "anon", "authenticated";

CREATE TRIGGER projectRepos_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projectRepos"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();

CREATE CONSTRAINT TRIGGER projectRepos_require_approved_repo
  AFTER UPDATE OR DELETE ON platform."projectRepos"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_approved_repo();
