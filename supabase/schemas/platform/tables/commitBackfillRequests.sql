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
