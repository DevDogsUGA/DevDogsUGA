-- Renames the "Dev Session" meeting kind back to "Build Session", undoing
-- `20260926120000_34_platform_meetings_kind_rename.sql`.
--
-- Forward-only for the same reason 34 was: the platform launched on
-- 2026-09-26 and 34 may already have run against production, so this does
-- not edit or delete it. Same order as 34, for the same reason -- drop the
-- check, backfill, add the check back -- because the old constraint would
-- reject the UPDATE and the new one would reject the old value.
--
-- `@devdogsuga/events`'s `MEETING_KIND_CHOICES` and `@devdogsuga/brand`'s
-- `EVENT_KIND_VISUALS` move back in the same change in Backstage.

alter table "platform"."meetings"
  drop constraint "meetings_kind_choices";

update "platform"."meetings"
  set "kind" = 'Build Session'
  where "kind" = 'Dev Session';

alter table "platform"."meetings"
  add constraint "meetings_kind_choices" check (
    "kind" is null
    or "kind" in ('Build Session', 'Study Session', 'Interest Meeting', 'Social')
  );

comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Build Session, Study Session, Interest Meeting, or Social. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';
