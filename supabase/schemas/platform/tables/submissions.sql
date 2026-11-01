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

CREATE TRIGGER submissions_touch_updatedAt
  BEFORE UPDATE ON platform."submissions"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();
