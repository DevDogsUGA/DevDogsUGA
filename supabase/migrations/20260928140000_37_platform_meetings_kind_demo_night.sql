-- Adds "Demo Night" to the meeting kinds.
--
-- For Feature Competition #1's presentations and judging on 2026-10-05, a
-- meeting no existing kind describes. Later competitions are judged through
-- agenda items instead, but this row keeps the value, so it stays allowed.
--
-- Nothing to backfill: widening the check cannot invalidate a row.
-- `@devdogsuga/events`'s `MEETING_KIND_CHOICES` and `@devdogsuga/brand`'s
-- `EVENT_KIND_VISUALS` gain the kind in the same change in Backstage.

alter table "platform"."meetings"
  drop constraint "meetings_kind_choices";

alter table "platform"."meetings"
  add constraint "meetings_kind_choices" check (
    "kind" is null
    or "kind" in ('Build Session', 'Study Session', 'Interest Meeting', 'Social', 'Demo Night')
  );

comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Build Session, Study Session, Interest Meeting, Social, or Demo Night. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';
