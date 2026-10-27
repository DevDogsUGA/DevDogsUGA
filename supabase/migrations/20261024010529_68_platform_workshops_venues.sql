ALTER TABLE "platform"."meetings"
  ADD COLUMN "venue" text;

ALTER TABLE "platform"."meetings"
  ADD COLUMN "room" text;

ALTER TABLE "platform"."workshops"
  ADD COLUMN "definitionId" text;

ALTER TABLE "platform"."workshops"
  ADD COLUMN "elHours" numeric(4,2) NOT NULL DEFAULT 1;

ALTER TABLE "platform"."workshops"
  ADD COLUMN "topics" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "platform"."meetings"
  ADD CONSTRAINT "meetings_venue_format" CHECK (((venue IS NULL) OR (venue ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)));

ALTER TABLE "platform"."workshops"
  ADD CONSTRAINT "workshops_definitionId_format" CHECK ((("definitionId" IS NULL) OR ("definitionId" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)));

ALTER TABLE "platform"."workshops"
  ADD CONSTRAINT "workshops_elHours_range" CHECK ((("elHours" > (0)::numeric) AND ("elHours" <= (8)::numeric)));

CREATE UNIQUE INDEX workshops_meeting_definition_live_key ON platform.workshops USING btree ("meetingId", "definitionId")
  WHERE (("deletedAt" IS NULL) AND ("definitionId" IS NOT NULL));

COMMENT ON COLUMN "platform"."meetings"."room" IS 'The room or space inside "venue", or null when the venue is the whole place. Written by reconcile.';

COMMENT ON COLUMN "platform"."meetings"."venue" IS 'The id of the venue (venues.json in @devdogsuga/events) this meeting is held at: a campus building, off-campus place, "virtual" or "tba". Resolved in config from the meeting or its series and written by reconcile. "building" and "location" are still written from it for the readers that have not moved yet. Null only on a row reconcile has not yet rewritten.';

COMMENT ON COLUMN "platform"."workshops"."definitionId" IS 'The id of the workshop definition (workshops.json in @devdogsuga/events) this row is one night of. Repeated sessions of the same workshop share it, so reflections, streaks and EL credit can follow the workshop rather than a title. Written by reconcile; null only on a row it has not yet rewritten.';

COMMENT ON COLUMN "platform"."workshops"."elHours" IS 'The EL (experiential learning) hours attending this workshop earns, copied from its definition. Independent of the meeting''s start and end times; one hour unless the definition says otherwise.';

COMMENT ON COLUMN "platform"."workshops"."topics" IS 'Topic tags from the workshop''s definition ("web", "databases"). Empty when it has none.';
