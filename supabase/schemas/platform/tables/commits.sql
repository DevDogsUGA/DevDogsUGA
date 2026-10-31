CREATE TABLE "platform"."commits" (
  "sha" text NOT NULL CONSTRAINT "commits_sha_format" CHECK ("sha" ~ '^[0-9a-f]{40}$'),
  "githubRepoId" bigint NOT NULL REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  "authorGithubId" bigint CONSTRAINT "commits_authorGithubId_positive" CHECK ("authorGithubId" > 0),
  "authorLogin" text CONSTRAINT "commits_authorLogin_length" CHECK (char_length("authorLogin") <= 100),
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "committedAt" timestamp with time zone NOT NULL,
  "message" text NOT NULL,
  "files" integer CONSTRAINT "commits_files_nonnegative" CHECK (files >= 0),
  "additions" bigint CONSTRAINT "commits_additions_nonnegative" CHECK (additions >= 0),
  "deletions" bigint CONSTRAINT "commits_deletions_nonnegative" CHECK (deletions >= 0),
  "statsState" text NOT NULL DEFAULT 'pending' CONSTRAINT "commits_statsState_choices" CHECK ("statsState" IN ('pending','complete','truncated','unavailable')),
  "firstSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commits_pkey" PRIMARY KEY (sha),
  CONSTRAINT "commits_stats_shape" CHECK ("statsState" <> 'complete' OR (files IS NOT NULL AND additions IS NOT NULL AND deletions IS NOT NULL))
);

ALTER TABLE "platform"."commits" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "commits_userId_committedAt_idx" ON platform."commits" ("userId", "committedAt" DESC);

CREATE INDEX "commits_githubRepoId_committedAt_idx" ON platform."commits" ("githubRepoId", "committedAt");

CREATE INDEX "commits_firstSeenAt_idx" ON platform."commits" ("firstSeenAt") WHERE "statsState" = 'pending';

CREATE POLICY "crud_public_policy_delete" ON "platform"."commits"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."commits"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."commits"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."commits"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."commits" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."commits" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."commits" IS 'Server-only. Commits by linked DevDogs members only, and nothing about anyone else. A commit is stored when its GitHub author id (the numeric id, never the login) matches a linked member; "userId" is that member and is never null. Account deletion: the member''s commits are deleted with the account (ON DELETE CASCADE), and with them their "repoCommits" provenance and their report citations. Nothing about a non-member is ever stored, and a deleted member''s commits do not come back, because nothing matches them any more.';

CREATE TRIGGER commits_award_first_commit
  AFTER INSERT OR UPDATE OF "userId" ON platform."commits"
  FOR EACH ROW EXECUTE FUNCTION platform.badges_after_commit();
