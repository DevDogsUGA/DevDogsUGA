CREATE TABLE "platform"."attendanceInvites" (
  "id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "meetingId" uuid                     NOT NULL,
  "ugaEmail"  text                     NOT NULL,
  "tokenHash" text                     NOT NULL,
  "createdBy" uuid,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "expiresAt" timestamp with time zone NOT NULL DEFAULT (now() + '14 days'::interval),
  "claimedAt" timestamp with time zone,
  "claimedBy" uuid,
  CONSTRAINT "attendanceInvites_claim_shape" CHECK ((("claimedAt" IS NULL) = ("claimedBy" IS NULL))),
  CONSTRAINT "attendanceInvites_pkey" PRIMARY KEY (id),
  CONSTRAINT "attendanceInvites_ugaEmail_lowercase" CHECK (("ugaEmail" = lower("ugaEmail")))
);

ALTER TABLE "platform"."attendanceInvites"
  ENABLE ROW LEVEL SECURITY;

ALTER TYPE "platform"."checkInMethod" ADD VALUE 'officer' AFTER 'import';


ALTER TABLE "platform"."attendanceInvites"
  ADD CONSTRAINT "attendanceInvites_claimedBy_fkey" FOREIGN KEY ("claimedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."attendanceInvites"
  ADD CONSTRAINT "attendanceInvites_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."attendanceInvites"
  ADD CONSTRAINT "attendanceInvites_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE UNIQUE INDEX "attendanceInvites_pending_key" ON platform."attendanceInvites" USING btree ("meetingId", "ugaEmail")
  WHERE ("claimedAt" IS NULL);

CREATE UNIQUE INDEX "attendanceInvites_tokenHash_key" ON platform."attendanceInvites" USING btree ("tokenHash");

CREATE INDEX "attendanceInvites_ugaEmail_idx" ON platform."attendanceInvites" USING btree ("ugaEmail");

CREATE POLICY "no_client_delete" ON "platform"."attendanceInvites"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."attendanceInvites"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."attendanceInvites"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "platform"."attendanceInvites"."ugaEmail" IS 'The invited address, always lowercase and ending @uga.edu.';

COMMENT ON TABLE "platform"."attendance" IS 'One row per member per meeting. Check-in is the only writer from the platform (method qr or manual_code). The one other writer is `backstage import attendance`, which an officer runs from a sign-in form or sheet for a meeting where members could not check in; its rows carry method import so they stay distinguishable and can be replaced. An import never overwrites a member''s own check-in. An officer can also add or remove a row from the console meeting page (method officer for an add; a removal is a hard delete with an attendance.removed audit event).';

COMMENT ON TABLE "platform"."attendanceInvites" IS 'An officer''s invitation for a UGA address with no account to be recorded at a meeting (method officer). Only the token''s SHA-256 hash is stored; the emailed link is the single-use secret. Claiming goes through UGA SSO and the signed-in address must equal ugaEmail. Account deletion: an invite claimed by the member is erased with the account (claimedBy cascades), pending invites for the member''s address are erased by the deletion job, and createdBy goes null when the inviting officer is deleted. Rows cascade with the meeting. No client policy reads or writes it.';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."attendanceInvites" TO "anon", "authenticated", "postgres", "service_role";

