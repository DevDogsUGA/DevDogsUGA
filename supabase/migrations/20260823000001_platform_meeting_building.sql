-- ============================================================
-- Which building, from a list the map can draw
-- ============================================================
--
-- `platform.meetings.location` has carried the whole answer to "where is
-- this" as one line of free text: "DLW 124". That is fine for printing and
-- useless for anything else, and the events page had started doing the
-- anything else -- `isAtDlw` in `meetingView.ts` matched the string against
-- /\bdlw\b/i and /\bdining,?\s+learning\b/i to decide whether to offer
-- directions. It failed closed on purpose, so "DLW124" written without the
-- space quietly got no Directions button. Guessing a building out of typed
-- text is a guess however carefully it is written.
--
-- This column is the fact itself. A closed list, because it is not only
-- printed: the directions dialog highlights the building on a campus map, and
-- a highlight needs a footprint. Every value below has one, generated from
-- OpenStreetMap by `apps/platform/scripts/generate-campus-map.ts` -- which is
-- also where the canonical list lives, so that the set an officer can pick
-- from is by construction the set the map can draw.
--
-- `location` stays, narrowed. It is now the room or space WITHIN the building
-- -- "124", "the second-floor lounge" -- and the pair is what gets printed.
-- Nothing reads it to decide anything.

alter table "platform"."meetings"
  add column "building" text;

comment on column "platform"."meetings"."building" is
  'Which building this meeting is in, from the closed list the campus map can draw. Null means nobody has picked one; ''Other'' means somewhere the map does not cover, and the free-text "location" beside it carries the detail either way.';

comment on column "platform"."meetings"."location" is
  'Where inside "building" -- a room number or the name of a space. Free text, authored in Airtable. Printed beside the building; never parsed to decide anything.';

-- The database backstop for the Airtable dropdown.
--
-- Same shape and same reasoning as `meetings_kind_choices`: `Building` is a
-- single select in the base, the registry parser rejects anything that is not
-- on the list, and this is what survives both of those being wrong. It exists
-- so it never fires.
--
-- The corollary from `20260808000001` applies unchanged and is worth
-- restating, because this list is the one most likely to grow: a constraint
-- here must never be STRICTER than its parser. A value the parser accepts and
-- this rejects is not a refused field, it is a constraint violation inside the
-- pull, which takes down the whole sync pass for every table until somebody
-- edits the offending cell.
--
-- Adding a building is therefore three things that move together, and a
-- deploy rather than a click: this list, `MEETING_BUILDING_CHOICES` in
-- `packages/airtable/src/registry.ts`, and the `HIGHLIGHTS` table in
-- `apps/platform/scripts/generate-campus-map.ts` -- the last of which has to
-- be re-run, since a building with no footprint is a pin over nothing. The
-- scaffolder is create-only and will not widen an existing select, so the
-- choice has to be added in the Airtable UI as well.
alter table "platform"."meetings"
  add constraint "meetings_building_choices"
  check (
    "building" is null
    or "building" in (
      'DLW',
      'Driftmier',
      'Plant Sciences',
      'Boyd',
      'MLC',
      'Science Learning Center',
      'Science Library',
      'Poultry Science',
      'Main Library',
      'Tate',
      'Other'
    )
  );
