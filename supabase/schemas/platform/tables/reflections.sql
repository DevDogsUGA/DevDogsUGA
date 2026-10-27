CREATE TABLE "platform"."reflections" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"        uuid                     NOT NULL,
  "meetingId"     uuid                     NOT NULL,
  "content"       text                     NOT NULL DEFAULT ''::text,
  "submittedAt"   timestamp with time zone,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reflections_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "reflections_pkey" PRIMARY KEY (id),
  CONSTRAINT "reflections_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."reflections"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "reflections_userId_meetingId_key" ON platform.reflections USING btree ("userId", "meetingId")
  WHERE ("meetingId" IS NOT NULL);

CREATE INDEX "reflections_userId_updatedAt_idx" ON platform.reflections USING btree ("userId", "updatedAt" DESC);

CREATE POLICY "no_client_delete" ON "platform"."reflections"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."reflections"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."reflections"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "own_select" ON "platform"."reflections"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."reflections" TO "anon", "authenticated", "postgres", "service_role";
