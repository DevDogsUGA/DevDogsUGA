CREATE TABLE "platform"."projectDocsProposals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "projectId" uuid NOT NULL REFERENCES platform."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "requestedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "enable" boolean NOT NULL,
  "githubRepoId" bigint NOT NULL REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  "ownerId" bigint NOT NULL CONSTRAINT "projectDocsProposals_ownerId_positive" CHECK ("ownerId" > 0),
  "slug" text NOT NULL CONSTRAINT "projectDocsProposals_slug_length" CHECK (char_length("slug") <= 80 AND char_length(btrim("slug")) >= 2),
  "baseSha" text NOT NULL CONSTRAINT "projectDocsProposals_baseSha_format" CHECK ("baseSha" ~ '^[0-9a-f]{40}$'),
  "prNumber" integer CONSTRAINT "projectDocsProposals_prNumber_positive" CHECK ("prNumber" > 0),
  "prUrl" text CONSTRAINT "projectDocsProposals_prUrl_shape" CHECK (char_length("prUrl") <= 2048 AND "prUrl" ~ '^https://[^/[:space:]]+'),
  "state" text NOT NULL CONSTRAINT "projectDocsProposals_state_choices" CHECK ("state" IN ('opening','open','merged','closed','failed')),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "lastError" text CONSTRAINT "projectDocsProposals_lastError_length" CHECK (char_length("lastError") <= 500),
  CONSTRAINT "projectDocsProposals_pkey" PRIMARY KEY (id),
  CONSTRAINT "projectDocsProposals_prNumber_key" UNIQUE ("prNumber")
);

ALTER TABLE "platform"."projectDocsProposals" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "projectDocsProposals_projectId_idx" ON platform."projectDocsProposals" ("projectId") WHERE state IN ('opening','open');

CREATE INDEX "projectDocsProposals_state_updatedAt_idx" ON platform."projectDocsProposals" (state, "updatedAt");

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectDocsProposals"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectDocsProposals"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectDocsProposals"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectDocsProposals"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectDocsProposals" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectDocsProposals" FROM "anon", "authenticated";

CREATE TRIGGER projectDocsProposals_touch_updatedAt
  BEFORE UPDATE ON platform."projectDocsProposals"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();

CREATE TRIGGER projectDocsProposals_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projectDocsProposals"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();
