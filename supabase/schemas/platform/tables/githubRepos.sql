CREATE TABLE "platform"."githubRepos" (
  "githubRepoId" bigint NOT NULL CONSTRAINT "githubRepos_githubRepoId_positive" CHECK ("githubRepoId" > 0),
  "ownerId" bigint NOT NULL CONSTRAINT "githubRepos_ownerId_positive" CHECK ("ownerId" > 0),
  "owner" text NOT NULL CONSTRAINT "githubRepos_owner_length" CHECK (char_length("owner") <= 100 AND char_length(btrim("owner")) >= 1),
  "name" text NOT NULL CONSTRAINT "githubRepos_name_length" CHECK (char_length("name") <= 100 AND char_length(btrim("name")) >= 1),
  "ownerType" text NOT NULL CONSTRAINT "githubRepos_ownerType_choices" CHECK ("ownerType" IN ('User','Organization')),
  "defaultBranch" text CONSTRAINT "githubRepos_defaultBranch_length" CHECK (char_length("defaultBranch") <= 255 AND char_length(btrim("defaultBranch")) >= 1),
  "health" text NOT NULL DEFAULT 'available' CONSTRAINT "githubRepos_health_choices" CHECK ("health" IN ('available','unavailable')),
  "lastCheckedAt" timestamp with time zone,
  "lastAvailableAt" timestamp with time zone,
  "unavailableSince" timestamp with time zone,
  "lastError" text CONSTRAINT "githubRepos_lastError_length" CHECK (char_length("lastError") <= 500),
  "isDevdogsOrg" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "githubRepos_pkey" PRIMARY KEY ("githubRepoId"),
  CONSTRAINT "githubRepos_health_shape" CHECK ((health = 'unavailable') = ("unavailableSince" IS NOT NULL))
);

ALTER TABLE "platform"."githubRepos" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "githubRepos_isDevdogsOrg_githubRepoId_idx" ON platform."githubRepos" ("isDevdogsOrg", "githubRepoId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."githubRepos"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."githubRepos"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."githubRepos"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."githubRepos"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."githubRepos" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."githubRepos" FROM "anon", "authenticated";

CREATE TRIGGER githubRepos_touch_updatedAt
  BEFORE UPDATE ON platform."githubRepos"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();
