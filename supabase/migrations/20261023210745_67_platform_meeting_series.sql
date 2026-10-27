ALTER TABLE "platform"."meetings"
  ADD COLUMN "series" text;

ALTER TABLE "platform"."meetings"
  ADD COLUMN "category" text;

ALTER TABLE "platform"."meetings"
  ADD CONSTRAINT "meetings_category_choices"
    CHECK (((category IS NULL) OR (category = ANY (ARRAY['build'::text, 'workshop'::text, 'social'::text, 'info'::text, 'study'::text, 'milestone'::text]))));

ALTER TABLE "platform"."meetings"
  ADD CONSTRAINT "meetings_series_format" CHECK (((series IS NULL) OR (series ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)));

COMMENT ON COLUMN "platform"."meetings"."category" IS 'What this night is: build, workshop, social, info (the Info Session), study, or milestone (Kickoff, Cold Start, Demo Day). Resolved in config from the meeting or its series and written by reconcile; it replaces "kind" and drives the event colour everywhere. Null only on a row reconcile has not yet rewritten.';

COMMENT ON COLUMN "platform"."meetings"."kind" IS 'DEPRECATED: replaced by "category"; nothing reads it and reconcile no longer writes it. Dropped in a later destructive change. Was a label for nights the structure could not describe: Build Session, Study Session, Interest Meeting, Social, or Demo Night.';

COMMENT ON COLUMN "platform"."meetings"."nameOverride" IS 'The resolved title of this night: an authored title, else the one derived from its series ("Build Session #3"). Reconcile writes it for every meeting from the resolver in @devdogsuga/events.';

COMMENT ON COLUMN "platform"."meetings"."series" IS 'The id of the series (series.json in @devdogsuga/events) this meeting belongs to, or null for a one-off. Written by reconcile; "nameOverride" carries the title the series derived.';

-- Data step: meetings.kind -> meetings.category, so events pages are never category-less before the first reconcile. Idempotent (fills only null categories); kind is dropped in a later change.

update "platform"."meetings"
set "category" = case
    when "kind" = 'Build Session' then 'build'
    when "kind" = 'Study Session' then 'study'
    when "kind" = 'Interest Meeting' then 'info'
    when "kind" = 'Social' then 'social'
    when "kind" = 'Demo Night' then 'milestone'
    -- Kickoff and Cold Start were kind-less one-offs; they are milestones.
    when "nameOverride" in ('Cold Start', 'Georgia 311 Kickoff') then 'milestone'
    -- Any other night with no kind was a workshop night.
    else 'workshop'
  end
where "category" is null;
