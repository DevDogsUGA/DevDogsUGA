CREATE TABLE "platform"."attendance" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "meetingId"  uuid                     NOT NULL,
  "userId"     uuid,
  "recordedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_meetingId_userId_key" UNIQUE ("meetingId", "userId"),
  CONSTRAINT "attendance_pkey" PRIMARY KEY (id),
  CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

ALTER TABLE "platform"."attendance"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."attendance"
  ADD COLUMN "method" platform."checkInMethod" NOT NULL;

CREATE INDEX "attendance_meetingId_idx" ON platform.attendance USING btree ("meetingId");

CREATE INDEX "attendance_userId_idx" ON platform.attendance USING btree ("userId", "recordedAt" DESC);

CREATE POLICY "no_client_delete" ON "platform"."attendance"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."attendance"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."attendance"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "own_select" ON "platform"."attendance"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."attendance" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON TABLE "platform"."attendance" IS 'One row per member per meeting. Check-in is the only writer from the platform (method qr or manual_code). The one other writer is `backstage import attendance`, which an officer runs from a sign-in form or sheet for a meeting where members could not check in; its rows carry method import so they stay distinguishable and can be replaced. An import never overwrites a member''s own check-in. An officer can also add or remove a row from the console meeting page (method officer for an add; a removal is a hard delete with an attendance.removed audit event).';

CREATE TRIGGER attendance_sync_badges
  AFTER INSERT OR DELETE ON platform.attendance
  FOR EACH ROW
  EXECUTE FUNCTION platform.badges_after_attendance();
