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

CREATE TRIGGER hackathons_touch_updatedAt
  BEFORE UPDATE ON platform."hackathons"
  FOR EACH ROW EXECUTE FUNCTION platform.touch_project_timestamp();
