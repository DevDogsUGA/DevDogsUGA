-- Renames the "Build Session" meeting kind to "Dev Session".
--
-- Forward-only: the platform launched on 2026-09-26, so this does not edit
-- `20260829040000_11_platform_events_core.sql`'s original constraint or
-- comment. Instead it drops the old check, backfills existing rows, and adds
-- the check back with the new choice list -- in that order, because the old
-- constraint still has 'Build Session' as its only allowed non-null value
-- for this row and would reject an UPDATE to 'Dev Session' before it is
-- dropped, and the new constraint has no 'Build Session' left to permit the
-- old value once it is added back.
--
-- Same name, same meaning, same accent colour everywhere it is drawn --
-- `@devdogsuga/og`'s `EVENT_KIND_VISUALS`, the newsletter theme, and
-- `packages/events`'s `MEETING_KIND_CHOICES` move with this in the same
-- change, but only this file touches the database.

alter table "platform"."meetings"
  drop constraint "meetings_kind_choices";

update "platform"."meetings"
  set "kind" = 'Dev Session'
  where "kind" = 'Build Session';

alter table "platform"."meetings"
  add constraint "meetings_kind_choices" check (
    "kind" is null
    or "kind" in ('Dev Session', 'Study Session', 'Interest Meeting', 'Social')
  );

comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Dev Session, Study Session, Interest Meeting, or Social. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';
