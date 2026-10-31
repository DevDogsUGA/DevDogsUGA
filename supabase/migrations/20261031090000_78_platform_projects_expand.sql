-- D1 expand only. Hand-written; CI verifies declarative equality.

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

CREATE TABLE "platform"."projectReportCommits" (
  "reportId" uuid NOT NULL REFERENCES platform."projectReports"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "sha" text NOT NULL REFERENCES platform."commits"("sha") ON UPDATE CASCADE ON DELETE CASCADE,
  "githubRepoId" bigint NOT NULL,
  CONSTRAINT "projectReportCommits_pkey" PRIMARY KEY ("reportId", sha),
  CONSTRAINT "projectReportCommits_sha_key" UNIQUE (sha),
  CONSTRAINT "projectReportCommits_githubRepoId_sha_fkey" FOREIGN KEY ("githubRepoId", sha) REFERENCES platform."repoCommits"("githubRepoId", sha) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."projectReportCommits" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "projectReportCommits_githubRepoId_sha_idx" ON platform."projectReportCommits" ("githubRepoId", sha);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectReportCommits"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectReportCommits" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectReportCommits" FROM "anon", "authenticated";

CREATE TABLE "platform"."hackathons" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source" text NOT NULL CONSTRAINT "hackathons_source_choices" CHECK ("source" IN ('devpost','other')),
  "devpostId" bigint CONSTRAINT "hackathons_devpostId_positive" CHECK ("devpostId" > 0),
  "url" text NOT NULL CONSTRAINT "hackathons_url_shape" CHECK (char_length("url") <= 2048 AND "url" ~ '^https://[^/[:space:]]+' AND position('#' in "url") = 0),
  "name" text NOT NULL CONSTRAINT "hackathons_name_length" CHECK (char_length("name") <= 200 AND char_length(btrim("name")) >= 2),
  "startsOn" date,
  "endsOn" date,
  "dateLabel" text CONSTRAINT "hackathons_dateLabel_length" CHECK (char_length("dateLabel") <= 200),
  "location" text NOT NULL CONSTRAINT "hackathons_location_length" CHECK (char_length("location") <= 200),
  "online" boolean NOT NULL DEFAULT false,
  "openState" text CONSTRAINT "hackathons_openState_choices" CHECK ("openState" IN ('open','upcoming','closed')),
  "approval" text NOT NULL CONSTRAINT "hackathons_approval_choices" CHECK ("approval" IN ('pending','approved','declined')),
  "submittedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "approvedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "decidedAt" timestamp with time zone,
  "lastSeenAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "hackathons_pkey" PRIMARY KEY (id),
  CONSTRAINT "hackathons_devpostId_key" UNIQUE ("devpostId"),
  CONSTRAINT "hackathons_url_key" UNIQUE (url),
  CONSTRAINT "hackathons_dates_order" CHECK ("startsOn" <= "endsOn"),
  CONSTRAINT "hackathons_source_shape" CHECK ((source = 'devpost' AND "devpostId" IS NOT NULL AND approval = 'approved') OR (source = 'other' AND "devpostId" IS NULL))
);

ALTER TABLE "platform"."hackathons" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "hackathons_approval_startsOn_idx" ON platform."hackathons" (approval, "startsOn");

CREATE INDEX "hackathons_lastSeenAt_idx" ON platform."hackathons" ("lastSeenAt") WHERE source = 'devpost';

CREATE POLICY "crud_public_policy_delete" ON "platform"."hackathons"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."hackathons"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."hackathons"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."hackathons"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."hackathons" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."hackathons" FROM "anon", "authenticated";

CREATE TABLE "platform"."submissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "projectId" uuid NOT NULL REFERENCES platform."projects"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "hackathonId" uuid NOT NULL REFERENCES platform."hackathons"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "url" text NOT NULL CONSTRAINT "submissions_url_shape" CHECK (char_length("url") <= 2048 AND "url" ~ '^https://[^/[:space:]]+' AND position('#' in "url") = 0),
  "result" text CONSTRAINT "submissions_result_length" CHECK (char_length("result") <= 280 AND char_length(btrim("result")) >= 1),
  "recordedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "submissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "submissions_url_key" UNIQUE (url)
);

ALTER TABLE "platform"."submissions" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "submissions_projectId_createdAt_idx" ON platform."submissions" ("projectId", "createdAt");

CREATE INDEX "submissions_hackathonId_projectId_idx" ON platform."submissions" ("hackathonId", "projectId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."submissions"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."submissions"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."submissions"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."submissions"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."submissions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."submissions" FROM "anon", "authenticated";

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

CREATE TABLE "platform"."repoSyncState" (
  "githubRepoId" bigint NOT NULL REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  "lastAttemptAt" timestamp with time zone,
  "lastSucceededAt" timestamp with time zone,
  "lastFullScanAt" timestamp with time zone,
  "leaseUntil" timestamp with time zone,
  "nextAttemptAt" timestamp with time zone,
  "leaseToken" uuid,
  "lastHeadSha" text CONSTRAINT "repoSyncState_lastHeadSha_format" CHECK ("lastHeadSha" ~ '^[0-9a-f]{40}$'),
  "scanHeadSha" text CONSTRAINT "repoSyncState_scanHeadSha_format" CHECK ("scanHeadSha" ~ '^[0-9a-f]{40}$'),
  "scanPage" integer NOT NULL DEFAULT 1 CONSTRAINT "repoSyncState_scanPage_positive" CHECK ("scanPage" > 0),
  "scanSince" timestamp with time zone,
  "mode" text NOT NULL DEFAULT 'incremental' CONSTRAINT "repoSyncState_mode_choices" CHECK ("mode" IN ('incremental','full')),
  "lastError" text CONSTRAINT "repoSyncState_lastError_length" CHECK (char_length("lastError") <= 500),
  "attempts" integer NOT NULL DEFAULT 0 CONSTRAINT "repoSyncState_attempts_nonnegative" CHECK (attempts >= 0),
  CONSTRAINT "repoSyncState_pkey" PRIMARY KEY ("githubRepoId")
);

ALTER TABLE "platform"."repoSyncState" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "repoSyncState_nextAttemptAt_leaseUntil_idx" ON platform."repoSyncState" ("nextAttemptAt", "leaseUntil");

CREATE POLICY "crud_public_policy_delete" ON "platform"."repoSyncState"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."repoSyncState"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."repoSyncState"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."repoSyncState"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."repoSyncState" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."repoSyncState" FROM "anon", "authenticated";

CREATE TABLE "platform"."commitBackfillRequests" (
  "userId" uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "githubId" bigint NOT NULL CONSTRAINT "commitBackfillRequests_githubId_positive" CHECK ("githubId" > 0),
  "requestedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "completedAt" timestamp with time zone,
  "leaseUntil" timestamp with time zone,
  "leaseToken" uuid,
  "lastError" text CONSTRAINT "commitBackfillRequests_lastError_length" CHECK (char_length("lastError") <= 500),
  "attempts" integer NOT NULL DEFAULT 0 CONSTRAINT "commitBackfillRequests_attempts_nonnegative" CHECK (attempts >= 0),
  CONSTRAINT "commitBackfillRequests_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "platform"."commitBackfillRequests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."commitBackfillRequests"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."commitBackfillRequests"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."commitBackfillRequests"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."commitBackfillRequests"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."commitBackfillRequests" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."commitBackfillRequests" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."commitBackfillRequests" IS 'Server-only. The queue of members whose full commit history still has to be read from GitHub. platform.request_commit_backfill enqueues one row per member when a GitHub identity is linked (an upsert: relinking resets "requestedAt" and clears "completedAt"). The commit-sync job drains it: it lists the member''s commits by "githubId" on every in-scope repository, then sets "completedAt". "leaseUntil", "leaseToken", "lastError" and "attempts" are the job''s lease and retry state. Account deletion: the row goes with the account (ON DELETE CASCADE).';

CREATE TABLE "platform"."projectSyncJobs" (
  "job" text NOT NULL CONSTRAINT "projectSyncJobs_job_choices" CHECK ("job" IN ('commit-sync','devpost-sync')),
  "leaseToken" uuid,
  "leaseUntil" timestamp with time zone,
  "lastAttemptAt" timestamp with time zone,
  "lastSucceededAt" timestamp with time zone,
  "nextAttemptAt" timestamp with time zone,
  "cursor" jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "projectSyncJobs_cursor_shape" CHECK (jsonb_typeof(cursor) = 'object' AND octet_length(cursor::text) <= 16384),
  "lastError" text CONSTRAINT "projectSyncJobs_lastError_length" CHECK (char_length("lastError") <= 500),
  "attempts" integer NOT NULL DEFAULT 0 CONSTRAINT "projectSyncJobs_attempts_nonnegative" CHECK (attempts >= 0),
  CONSTRAINT "projectSyncJobs_pkey" PRIMARY KEY (job)
);

ALTER TABLE "platform"."projectSyncJobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectSyncJobs"
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectSyncJobs"
  AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectSyncJobs"
  AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectSyncJobs"
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectSyncJobs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectSyncJobs" FROM "anon", "authenticated";

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

ALTER TABLE platform.projects
  ADD COLUMN "slug" text CONSTRAINT "projects_slug_length" CHECK (char_length("slug") <= 80 AND char_length(btrim("slug")) >= 2),
  ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN "featured" boolean NOT NULL DEFAULT false,
  ADD COLUMN "inSwitcher" boolean NOT NULL DEFAULT false,
  ADD COLUMN "devdogsOwned" boolean NOT NULL DEFAULT false,
  ADD COLUMN "tagline" text CONSTRAINT "projects_tagline_length" CHECK (char_length("tagline") <= 160),
  ADD COLUMN "yearLabel" text CONSTRAINT "projects_yearLabel_length" CHECK (char_length("yearLabel") <= 40),
  ADD COLUMN "note" text CONSTRAINT "projects_note_length" CHECK (char_length("note") <= 280),
  ADD COLUMN "liveLabel" text CONSTRAINT "projects_liveLabel_length" CHECK (char_length("liveLabel") <= 80),
  ADD COLUMN "switcherBlurb" text CONSTRAINT "projects_switcherBlurb_length" CHECK (char_length("switcherBlurb") <= 80),
  ADD COLUMN "iconKey" text CONSTRAINT "projects_iconKey_length" CHECK (char_length("iconKey") <= 64),
  ADD COLUMN "colorKey" text CONSTRAINT "projects_colorKey_length" CHECK (char_length("colorKey") <= 64),
  ADD COLUMN "showcaseLabel" text CONSTRAINT "projects_showcaseLabel_length" CHECK (char_length("showcaseLabel") <= 80),
  ADD COLUMN "liveUrl" text CONSTRAINT "projects_liveUrl_shape" CHECK (char_length("liveUrl") <= 2048 AND ("liveUrl" ~ '^https://[^/[:space:]]+' OR "liveUrl" ~ '^/([^/]|$)')),
  ADD COLUMN "switcherUrl" text CONSTRAINT "projects_switcherUrl_shape" CHECK (char_length("switcherUrl") <= 2048 AND ("switcherUrl" ~ '^https://[^/[:space:]]+' OR "switcherUrl" ~ '^/([^/]|$)')),
  ADD COLUMN "contributionMode" text CONSTRAINT "projects_contributionMode_choices" CHECK ("contributionMode" IN ('open','closed')),
  ADD COLUMN "displayOrder" integer NOT NULL DEFAULT 0,
  ADD COLUMN "docsRepoId" bigint REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD COLUMN "docsRequested" boolean NOT NULL DEFAULT false,
  ADD COLUMN "docsFirstPublishedAt" timestamp with time zone,
  ADD COLUMN "docsPausedAt" timestamp with time zone,
  ADD COLUMN "docsPauseReason" text CONSTRAINT "projects_docsPauseReason_length" CHECK (char_length("docsPauseReason") <= 280),
  ADD COLUMN "docsConfirmedOwnerId" bigint CONSTRAINT "projects_docsConfirmedOwnerId_positive" CHECK ("docsConfirmedOwnerId" > 0),
  ADD COLUMN "docsConfirmedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN "docsConfirmedAt" timestamp with time zone,
  ADD COLUMN "lastDocsDispatchedSha" text CONSTRAINT "projects_lastDocsDispatchedSha_format" CHECK ("lastDocsDispatchedSha" ~ '^[0-9a-f]{40}$'),
  ADD CONSTRAINT "projects_docs_pause_shape" CHECK (("docsPausedAt" IS NULL) = ("docsPauseReason" IS NULL));

CREATE UNIQUE INDEX "projects_slug_key" ON platform.projects (slug) WHERE slug IS NOT NULL;
CREATE INDEX "projects_featured_displayOrder_id_idx" ON platform.projects ("displayOrder", id) WHERE featured;
CREATE INDEX "projects_inSwitcher_displayOrder_id_idx" ON platform.projects ("displayOrder", id) WHERE "inSwitcher";

ALTER TABLE platform."badgeAwards" ADD COLUMN "commitSha" text REFERENCES platform.commits(sha) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION platform.guard_project_structure()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_project uuid;
begin
  if tg_table_name = 'projects' then
    if tg_op = 'DELETE' then
      if old."devdogsOwned"
         or exists (select 1 from platform."projectReports" where "projectId" = old.id)
         or exists (select 1 from platform.submissions where "projectId" = old.id) then
        raise exception 'Project cannot be deleted';
      end if;
      return old;
    end if;
    if tg_op = 'UPDATE' then
      if old."docsFirstPublishedAt" is not null and
         (new.slug is distinct from old.slug or new."docsFirstPublishedAt" is distinct from old."docsFirstPublishedAt") then
        raise exception 'Published docs slug and first publication are immutable';
      end if;
      if old."devdogsOwned" and not new."devdogsOwned" then
        raise exception 'DevDogs ownership is irreversible';
      end if;
      if new.slug is distinct from old.slug and exists (
        select 1 from platform."projectDocsProposals" where "projectId" = old.id and state in ('opening','open')
      ) then raise exception 'Docs proposal freezes slug'; end if;
    end if;
    if new.slug is not null and (tg_op = 'INSERT' or new.slug is distinct from old.slug) then
      if char_length(new.slug) not between 2 and 80 or new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception 'Invalid project slug';
      end if;
      if new.slug in ('toolkit','workshops','schedule-builder','operations') or
         (new.slug = 'platform' and lower(btrim(new.name)) <> 'devdogs platform') then
        raise exception 'Reserved project slug';
      end if;
    end if;
    if new."docsRepoId" is not null and not exists (
      select 1 from platform."projectRepos" where "projectId" = new.id
      and "githubRepoId" = new."docsRepoId" and approval = 'approved'
    ) then raise exception 'Docs repository must be an approved project link'; end if;
    return new;
  end if;

  -- Every link/owner write locks the parent, serializing the ten-link limit.
  if tg_op = 'UPDATE' and new."projectId" is distinct from old."projectId" then
    raise exception 'Replace links instead of moving them between projects';
  end if;
  v_project := case when tg_op = 'DELETE' then old."projectId" else new."projectId" end;
  perform 1 from platform.projects where id = v_project for update;
  if tg_table_name = 'projectRepos' then
    if tg_op = 'INSERT' and (select count(*) from platform."projectRepos" where "projectId" = v_project) >= 10 then
      raise exception 'At most ten project repository links';
    end if;
    if tg_op in ('DELETE','UPDATE') then
      if exists (select 1 from platform.projects where id = v_project and "docsRepoId" = old."githubRepoId")
         and (tg_op = 'DELETE' or new."githubRepoId" <> old."githubRepoId" or new.approval <> 'approved') then
        raise exception 'Cannot remove the docs repository link';
      end if;
      if (tg_op = 'DELETE' or new."githubRepoId" <> old."githubRepoId") and exists (
        select 1 from platform."projectReportCommits" pc join platform."projectReports" r on r.id = pc."reportId"
        where r."projectId" = v_project and pc."githubRepoId" = old."githubRepoId"
      ) then raise exception 'Repository link supports report citations'; end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.guard_project_structure() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.guard_project_structure() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION platform.validate_project_showcase()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if cardinality(new.tags) > 20 or exists (
    select 1 from unnest(new.tags) t where t is null or t <> btrim(t) or char_length(t) not between 1 and 40
  ) or (select count(distinct t) from unnest(new.tags) t) <> cardinality(new.tags) then
    raise exception 'Invalid project tags';
  end if;
  if new."iconKey" is not null and new."iconKey" not in ('HouseIcon','DogDaysIcon','DogPackIcon','MagnifyingGlassIcon','dogdays','dogpack') then
    raise exception 'Invalid icon registry key';
  end if;
  if new."colorKey" is not null and new."colorKey" not in ('foreground','cyan-400','red-600','red-700','purple-500','emerald-400') then
    raise exception 'Invalid color registry key';
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.validate_project_showcase() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.validate_project_showcase() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION platform.validate_report_commit()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_report platform."projectReports"%rowtype;
begin
  select * into strict v_report from platform."projectReports" where id = new."reportId" for update;
  perform 1 from platform.projects where id = v_report."projectId" for update;
  if not exists (
    select 1 from platform.commits c
    join platform."repoCommits" rc on rc.sha = c.sha and rc."githubRepoId" = new."githubRepoId"
    join platform."projectRepos" pr on pr."githubRepoId" = rc."githubRepoId" and pr."projectId" = v_report."projectId" and pr.approval = 'approved'
    where c.sha = new.sha and c."userId" = v_report."userId"
      and (c."committedAt" at time zone 'America/New_York')::date between v_report."startDate" and v_report."endDate"
  ) then raise exception 'Commit author, provenance, approved project link or Eastern date is ineligible'; end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.validate_report_commit() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.validate_report_commit() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION platform.request_commit_backfill()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Only commits by linked members are stored, so linking GitHub is what
  -- makes a member's history eligible. Queue it by GitHub user id, never by
  -- login. A provider_id that is not a positive bigint cannot be matched, so
  -- it is skipped rather than failing the sign-in.
  if new.provider = 'github' and new.provider_id ~ '^[1-9][0-9]{0,18}$' then
    if new.provider_id::numeric <= 9223372036854775807 then
      insert into platform."commitBackfillRequests" ("userId", "githubId")
      values (new.user_id, new.provider_id::bigint)
      on conflict ("userId") do update
        set "githubId" = excluded."githubId",
            "requestedAt" = now(),
            "completedAt" = null;
    end if;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.request_commit_backfill() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.request_commit_backfill() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION platform.award_first_commit(p_user uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_sha text;
  v_id uuid;
begin
  if p_user is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-commit:' || p_user::text, 0));
  select c.sha into v_sha from platform.commits c
  where c."userId" = p_user and exists (select 1 from platform."repoCommits" rc where rc.sha = c.sha)
  order by c."committedAt", c.sha limit 1;
  if v_sha is null then return; end if;
  if exists (select 1 from platform."badgeAwards" where "userId" = p_user and "badgeId" = 'first-commit') then
    -- A later backfill can discover older evidence, but never reactivate a
    -- withdrawn award, alter a manual award, or change its date/visibility.
    update platform."badgeAwards" set "commitSha" = v_sha
    where "userId" = p_user and "badgeId" = 'first-commit'
      and method = 'automatic' and "withdrawnAt" is null;
    return;
  end if;
  insert into platform."badgeAwards" ("userId", "badgeId", method, repeatable, "commitSha")
  values (p_user, 'first-commit', 'automatic', false, v_sha)
  on conflict ("userId", "badgeId", (coalesce("workshopDefinitionId", '')))
    where "withdrawnAt" is null and not repeatable do nothing returning id into v_id;
  if v_id is not null then
    insert into platform."auditEvents" ("actorType", source, action, "targetType", "targetId", metadata)
    values ('system', 'platform', 'badge.awarded', 'badgeAward', v_id::text,
      jsonb_build_object('userId', p_user, 'badgeId', 'first-commit', 'commitSha', v_sha, 'automatic', true));
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.award_first_commit(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.award_first_commit(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION platform.badges_after_commit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid;
begin
  if tg_table_name = 'repoCommits' then
    select "userId" into v_user from platform.commits where sha = new.sha;
  else v_user := new."userId"; end if;
  perform platform.award_first_commit(v_user);
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.badges_after_commit() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.badges_after_commit() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION platform.touch_project_timestamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new."updatedAt" := now();
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION platform.touch_project_timestamp() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION platform.touch_project_timestamp() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE VIEW platform."projectRepoDetails" WITH (security_invoker=on) AS
SELECT pr.*, gr.owner, gr.name, gr."ownerId", gr."defaultBranch", gr.health,
       gr."lastCheckedAt", gr."lastAvailableAt", gr."unavailableSince"
FROM platform."projectRepos" pr JOIN platform."githubRepos" gr USING ("githubRepoId");

REVOKE ALL ON TABLE platform."projectRepoDetails" FROM "anon", "authenticated";
GRANT SELECT ON TABLE platform."projectRepoDetails" TO "postgres", "service_role";

CREATE TRIGGER projects_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projects"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();

CREATE TRIGGER projectRepos_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projectRepos"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();

CREATE TRIGGER projectOwners_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projectOwners"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();

CREATE TRIGGER projects_validate_showcase
  BEFORE INSERT OR UPDATE OF tags, "iconKey", "colorKey" ON platform."projects"
  FOR EACH ROW EXECUTE FUNCTION platform.validate_project_showcase();

CREATE TRIGGER projectReportCommits_validate
  BEFORE INSERT OR UPDATE ON platform."projectReportCommits"
  FOR EACH ROW EXECUTE FUNCTION platform.validate_report_commit();

CREATE TRIGGER identities_request_commit_backfill
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  WHEN (NEW.provider = 'github')
  EXECUTE FUNCTION platform.request_commit_backfill();

CREATE TRIGGER commits_award_first_commit
  AFTER INSERT OR UPDATE OF "userId" ON platform."commits"
  FOR EACH ROW EXECUTE FUNCTION platform.badges_after_commit();

CREATE TRIGGER repoCommits_award_first_commit
  AFTER INSERT ON platform."repoCommits"
  FOR EACH ROW EXECUTE FUNCTION platform.badges_after_commit();

CREATE TRIGGER githubRepos_touch_updatedAt
  BEFORE UPDATE ON platform."githubRepos"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();

CREATE TRIGGER hackathons_touch_updatedAt
  BEFORE UPDATE ON platform."hackathons"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();

CREATE TRIGGER submissions_touch_updatedAt
  BEFORE UPDATE ON platform."submissions"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();

CREATE TRIGGER projectDocsProposals_touch_updatedAt
  BEFORE UPDATE ON platform."projectDocsProposals"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();

CREATE TRIGGER projectDocsProposals_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projectDocsProposals"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();

CREATE INDEX "badgeAwards_commitSha_idx" ON platform."badgeAwards" ("commitSha") WHERE "commitSha" IS NOT NULL;

-- Reuse the pre-expand platform row, if present. Only new fields are initialized;
-- legacy description, repositories, status and actor fields remain untouched.
UPDATE platform.projects
SET slug = 'platform', "devdogsOwned" = true, featured = true, "inSwitcher" = true,
    tagline = 'Member Portal and Dev Tools', "yearLabel" = '2026 – present',
    "iconKey" = 'HouseIcon', "colorKey" = 'cyan-400', "showcaseLabel" = 'Maintenance',
    "contributionMode" = 'closed', "switcherUrl" = '/', "switcherBlurb" = 'Member Portal',
    tags = ARRAY['next','typescript','tailwind','drizzle','supabase','postgres']
WHERE lower(btrim(name)) = 'devdogs platform' AND slug IS NULL;
