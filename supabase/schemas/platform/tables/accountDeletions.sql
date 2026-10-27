CREATE TABLE "platform"."accountDeletions" (
  "userId"        uuid                     NOT NULL,
  "scheduledFor"  timestamp with time zone NOT NULL,
  "requestedBy"   uuid,
  "reason"        text,
  "email"         text                     NOT NULL,
  "name"          text,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  "attempts"      integer                  NOT NULL DEFAULT 0,
  "lastAttemptAt" timestamp with time zone,
  "lastError"     text,
  CONSTRAINT "accountDeletions_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "accountDeletions_requestedBy_users_id_fkey" FOREIGN KEY ("requestedBy") REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "platform"."accountDeletions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "accountDeletions_scheduledFor_idx" ON platform."accountDeletions" USING btree ("scheduledFor");

CREATE POLICY "crud_public_policy_delete" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."accountDeletions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."accountDeletions" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."accountDeletions" IS 'Server-only. A member''s scheduled account deletion (14-day window). "userId" has no foreign key on purpose: the deletion job removes the auth user partway through, and the row must outlive it so a failed later step (audit event, email) is retried; the job deletes the row last. A cancelled deletion deletes it too. "requestedBy" is the officer who scheduled it (null or equal to the member for a self-requested one); it is nulled if that officer is deleted. "email" and "name" are kept only so the completion email can be sent after the member is gone. Account deletion: this table is the deletion, nothing else holds a member through it.';
