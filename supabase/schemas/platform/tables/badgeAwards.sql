CREATE TABLE "platform"."badgeAwards" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"               uuid                     NOT NULL,
  "badgeId"              text                     NOT NULL,
  "workshopDefinitionId" text,
  "method"               text                     NOT NULL,
  "repeatable"           boolean                  NOT NULL,
  "awardedAt"            timestamp with time zone NOT NULL DEFAULT now(),
  "awardedBy"            uuid,
  "citation"             text,
  "meetingId"            uuid,
  "contributionId"       uuid,
  "withdrawnAt"          timestamp with time zone,
  "withdrawnReason"      text,
  "hidden"               boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "badgeAwards_awardedBy_fkey" FOREIGN KEY ("awardedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "badgeAwards_badgeId_format" CHECK (("badgeId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
  CONSTRAINT "badgeAwards_citation_shape" CHECK (((method = 'automatic' AND citation IS NULL AND "awardedBy" IS NULL) OR (method = 'manual' AND citation IS NOT NULL AND char_length(btrim(citation)) BETWEEN 1 AND 280))),
  CONSTRAINT "badgeAwards_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES platform.contributions(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "badgeAwards_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "badgeAwards_method_choices" CHECK ((method = ANY (ARRAY['automatic'::text, 'manual'::text]))),
  CONSTRAINT "badgeAwards_pkey" PRIMARY KEY (id),
  CONSTRAINT "badgeAwards_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "badgeAwards_withdrawn_shape" CHECK ((("withdrawnAt" IS NULL AND "withdrawnReason" IS NULL) OR ("withdrawnAt" IS NOT NULL AND "withdrawnReason" IS NOT NULL AND char_length(btrim("withdrawnReason")) BETWEEN 1 AND 280))),
  CONSTRAINT "badgeAwards_workshop_shape" CHECK (((("badgeId" = 'workshop-completed'::text) = ("workshopDefinitionId" IS NOT NULL)) AND (("workshopDefinitionId" IS NULL) OR ("workshopDefinitionId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))))
);

ALTER TABLE "platform"."badgeAwards"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "badgeAwards_userId_awardedAt_idx" ON platform."badgeAwards" USING btree ("userId", "awardedAt" DESC);

CREATE UNIQUE INDEX "badgeAwards_one_live_key" ON platform."badgeAwards" USING btree ("userId", "badgeId", (COALESCE("workshopDefinitionId", ''::text)))
  WHERE (("withdrawnAt" IS NULL) AND (NOT repeatable));

CREATE INDEX "badgeAwards_meetingId_idx" ON platform."badgeAwards" USING btree ("meetingId")
  WHERE ("meetingId" IS NOT NULL);

CREATE POLICY "crud_public_policy_delete" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."badgeAwards"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."badgeAwards" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."badgeAwards" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."badgeAwards" IS 'Server-only. One dated award of a badge defined in badges.json (@devdogsuga/events). Automatic awards (Workshop completed, First Merge) are written by the triggers on attendance, reflections and contributions in the same transaction as the evidence; manual ones by an officer, with a required public citation. A one-time badge has one live row per (member, badge, workshop); a repeatable one many. "withdrawnAt" retires an award whose evidence went (or that an officer withdrew) and keeps the row for the record; "hidden" is the member hiding it from their public profile, which hides the citation too. Public reads go only through the public-profile loaders. Account deletion: the member''s awards are deleted with the account (ON DELETE CASCADE); a badge awarded BY a deleted officer stays with "awardedBy" set to null and is shown as awarded by "Deleted member".';

COMMENT ON COLUMN "platform"."badgeAwards"."badgeId" IS 'The badge definition id from badges.json. Not a foreign key: the definitions are config, and an award whose badge was later removed still renders under its raw id.';

COMMENT ON COLUMN "platform"."badgeAwards"."workshopDefinitionId" IS 'The workshop definition id, set exactly for Workshop completed awards (one badge per reusable workshop, not per night).';

COMMENT ON COLUMN "platform"."badgeAwards"."repeatable" IS 'Copied from the badge definition at award time. Only non-repeatable awards are held to one live row per (member, badge, workshop).';

COMMENT ON COLUMN "platform"."badgeAwards"."meetingId" IS 'Evidence for Workshop completed: the meeting whose attendance and submitted reflection support it. Re-pointed to another qualifying night when that one is removed; set null if the meeting row is ever deleted.';

COMMENT ON COLUMN "platform"."badgeAwards"."contributionId" IS 'Evidence for First Merge: the member''s earliest matched merged pull request.';

COMMENT ON COLUMN "platform"."badgeAwards"."citation" IS 'Manual badges only: the short public explanation of the achievement, shown beside the badge (and hidden with it).';
