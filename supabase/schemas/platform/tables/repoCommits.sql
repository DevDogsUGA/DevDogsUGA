CREATE TABLE "platform"."repoCommits" (
  "githubRepoId" bigint NOT NULL REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  "sha" text NOT NULL REFERENCES platform."commits"("sha") ON UPDATE CASCADE ON DELETE CASCADE,
  "firstSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
  "defaultBranch" text NOT NULL CONSTRAINT "repoCommits_defaultBranch_length" CHECK (char_length("defaultBranch") <= 255 AND char_length(btrim("defaultBranch")) >= 1),
  CONSTRAINT "repoCommits_pkey" PRIMARY KEY ("githubRepoId", sha)
);

ALTER TABLE "platform"."repoCommits" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "repoCommits_sha_githubRepoId_idx" ON platform."repoCommits" (sha, "githubRepoId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."repoCommits"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."repoCommits"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."repoCommits"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."repoCommits"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."repoCommits" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."repoCommits" FROM "anon", "authenticated";

CREATE TRIGGER repoCommits_award_first_commit
  AFTER INSERT ON platform."repoCommits"
  FOR EACH ROW EXECUTE FUNCTION platform.badges_after_commit();
