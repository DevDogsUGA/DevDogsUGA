CREATE TABLE "platform"."contributions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "repo"           text                     NOT NULL,
  "repoPrivate"    boolean                  NOT NULL DEFAULT false,
  "prNumber"       integer                  NOT NULL,
  "title"          text                     NOT NULL,
  "url"            text                     NOT NULL,
  "mergedAt"       timestamp with time zone NOT NULL,
  "authorGithubId" text                     NOT NULL,
  "authorLogin"    text                     NOT NULL,
  "userId"         uuid,
  "deliveryId"     text,
  "createdAt"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "contributions_pkey" PRIMARY KEY (id),
  CONSTRAINT "contributions_repo_prNumber_key" UNIQUE ("repo", "prNumber"),
  CONSTRAINT "contributions_deliveryId_key" UNIQUE ("deliveryId"),
  CONSTRAINT "contributions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."contributions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "contributions_userId_mergedAt_idx" ON platform."contributions" USING btree ("userId", "mergedAt" DESC);

CREATE INDEX "contributions_unmatched_authorGithubId_idx" ON platform."contributions" USING btree ("authorGithubId") WHERE ("userId" IS NULL);

CREATE POLICY "crud_public_policy_delete" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."contributions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."contributions" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."contributions" IS 'Server-only. One merged pull request in a DevDogs organization repository, fed by the GitHub App webhook and the backfill. "authorGithubId" is the author''s numeric GitHub user id (matched against auth.identities.provider_id, never the login). "userId" is the matched member, or null while the author has no linked GitHub account; platform.claim_contributions fills it when they link. Account deletion: the member''s rows are deleted with the account (ON DELETE CASCADE) because a member''s contribution history is personal data; rows with a null "userId" belong to no account and stay. "repoPrivate" rows count for the member (their own page, streaks) but are never shown on a public profile. Public reads go only through the public-profile loaders. Caveats: unique on (repo full name, PR number), so a repository rename or transfer makes a backfill record its PRs again under the new name; unlinking GitHub does not release a member''s rows.';

CREATE TRIGGER contributions_award_first_merge
  AFTER INSERT OR UPDATE OF "userId" ON platform.contributions
  FOR EACH ROW
  EXECUTE FUNCTION platform.badges_after_contribution();
