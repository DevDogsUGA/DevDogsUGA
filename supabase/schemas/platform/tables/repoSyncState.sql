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
