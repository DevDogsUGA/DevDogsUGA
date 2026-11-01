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
