-- ============================================================
-- Three things an officer can say about a night
-- ============================================================
--
-- `platform.meetings` has, until now, held only when and where the club
-- gathered: a name, a location, two timestamps, and a link to the week's
-- attendance form. Everything else the events page shows about a meeting it
-- infers from the meeting's STRUCTURE -- the workshops hanging off it, the
-- competition being judged at it. That inference is right most weeks and has
-- nothing to say in the weeks it is wrong, and there is currently nowhere for
-- an officer to correct it.
--
-- These three columns are that place. All nullable, all officer-authored, all
-- pulled from Airtable like `attendanceFormUrl` before them, and all optional
-- in the strong sense: a meeting with none of them set is a complete meeting,
-- and the page falls back to what it derives. Nothing here gates whether a
-- meeting syncs. See `pullMeetings` in
-- `apps/platform/src/server/airtable/sync.ts`, which deliberately leaves all
-- three out of its completeness check, because officers fill Airtable fields
-- one at a time and a pass landing between two keystrokes must not complain.
--
-- ## The constraints below are a backstop, not the gate
--
-- Every rule these express is applied FIRST by a parser in
-- `packages/airtable/src/registry.ts`, which returns null for a value it will
-- not publish, and by `checkMeeting` in
-- `apps/platform/src/server/airtable/refusals.ts`, which writes the reason
-- into the officer's `⚙️ Sync status` cell. That ordering is not decoration.
-- A bad value that reaches the insert does not produce a refused field, it
-- produces a constraint violation, and a constraint violation inside the pull
-- takes down the entire sync pass -- every table, for every officer -- until
-- somebody edits the offending cell. So these exist to make an unpublishable
-- value unrepresentable if the parser is ever wrong or bypassed, and the
-- parser exists so they never fire.
--
-- The corollary is that a constraint here must never be STRICTER than its
-- parser. A value the parser accepts and the constraint rejects is exactly the
-- pass-killing case above, arrived at from the other direction.

alter table "platform"."meetings"
  add column "summary" text,
  add column "kind"    text,
  add column "rsvpUrl" text;

-- ============================================================
-- Summary
-- ============================================================
--
-- One or two sentences about the night, written by whoever is running the
-- semester. Null means "nothing authored", and the page renders the derived
-- agenda -- the workshops and the judging -- rather than an empty space.
comment on column "platform"."meetings"."summary" is
  'One or two sentences about this meeting, authored by an officer in Airtable. Null means none was written, and the events page shows a derived agenda instead. Capped at 240 characters; longer text is refused rather than truncated.';

-- Caps the length rather than trusting the card to cope.
--
-- 240 characters is roughly two sentences, which is what the events card is
-- laid out for. The number matters less than the fact that SOMETHING enforces
-- it: without a cap, a summary that outgrows its card is discovered by a
-- member looking at a broken page rather than by the officer who wrote it.
--
-- The parser refuses a longer summary outright instead of truncating, and
-- that is the load-bearing half. Publishing the first 240 characters of a
-- 400-character summary puts half a sentence under an officer's name, on a
-- public page, with no signal anywhere that it happened. Refusing it puts a
-- message in the cell they typed it into.
--
-- Measured on the normalized text -- trimmed, internal whitespace collapsed --
-- which is the same text the parser measures and the same text the card lays
-- out. `char_length` counts characters rather than bytes, so an em dash costs
-- one, as it should.
alter table "platform"."meetings"
  add constraint "meetings_summary_length"
  check (
    "summary" is null
    or char_length("summary") <= 240
  );

-- ============================================================
-- Kind
-- ============================================================
--
-- Names a night whose structure cannot describe it, and nothing else.
--
-- This is the column most likely to be misread as "what type of meeting is
-- this", which it is not. A meeting that runs workshops is already a workshop
-- night -- the workshops say so -- and a meeting a competition points at is
-- already a judging night. Storing those here would create a second answer to
-- a question the schema already answers, and the two would disagree the first
-- time somebody edited one and not the other.
--
-- What is left is the set of nights the structure is silent about: a social
-- with no workshops is, structurally, indistinguishable from an empty calendar
-- entry. Hence four values and not fifteen.
comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Social, Career, Info session, or Open lab. Null is the normal case -- the kind is then derived from the meeting''s workshops and judging. Not a label for every night.';

-- The database backstop for the Airtable dropdown.
--
-- `Kind` is a single select in the base, so an out-of-list value is close to
-- unrepresentable at the source, and the parser rejects one anyway. This
-- constraint is what survives both of those being wrong -- a select whose
-- choices somebody widened in the Airtable UI, or a row written by something
-- other than the sync.
--
-- Spelled out as a list rather than an enum type on purpose. An enum would be
-- the tighter modelling, and it would also make adding a fifth kind a
-- migration with a transaction caveat rather than one line in a check; this
-- list is expected to move as the club works out what it needs to name.
alter table "platform"."meetings"
  add constraint "meetings_kind_choices"
  check (
    "kind" is null
    or "kind" in ('Social', 'Career', 'Info session', 'Open lab')
  );

-- ============================================================
-- RSVP
-- ============================================================
--
-- Where a member goes to say they are coming. Normally the meeting's event
-- page on the UGA Involvement Network, which is where the club's events
-- already live.
--
-- Separate from `attendanceFormUrl` and deliberately so: that one is the
-- check-in form filled in DURING the meeting by people already in the room,
-- this one is a promise to show up made beforehand by people who are not. They
-- have different audiences, different lifetimes, and different hosts.
comment on column "platform"."meetings"."rsvpUrl" is
  'Per-meeting RSVP link, normally the meeting''s UGA Involvement Network event page. Pulled from Airtable; null when there is nothing to RSVP to. Distinct from "attendanceFormUrl", which is the in-room check-in form.';

-- Rejects anything that is not an RSVP link on an allowlisted host.
--
-- Modelled directly on `meetings_attendanceFormUrl_airtable`, and for the same
-- reason: the value is rendered as an href on a public page under the club's
-- name, so an officer pasting the wrong thing into the wrong field is one typo
-- away from the platform pointing members somewhere else entirely. Members
-- have no way to tell a mispaste from a link the club meant to publish --
-- that is precisely what makes it worth constraining the host rather than
-- merely the scheme.
--
-- `https` only. An `http` link on a page served over TLS is a downgrade the
-- club has no reason to offer, and a scheme that is neither -- `javascript:`
-- most of all -- has no business reaching an href at all.
--
-- The allowlist has one entry today. Adding a second is a migration and a
-- one-line change to `RSVP_URL_ALLOWED_HOSTS` in
-- `packages/airtable/src/registry.ts`, and both have to move together: the
-- parser must stay at least as strict as this constraint, or it will accept a
-- value whose insert then fails and takes the sync pass with it.
--
-- The path is optional, matching the parser, which accepts a bare origin. The
-- character class excludes `@`, which is what keeps a credential-carrying URL
-- -- `https://someone@uga.campuslabs.com/x`, which `new URL()` parses happily
-- and whose hostname is allowlisted -- out of the column.
alter table "platform"."meetings"
  add constraint "meetings_rsvpUrl_host"
  check (
    "rsvpUrl" is null
    or "rsvpUrl" ~ '^https://uga\.campuslabs\.com(/[A-Za-z0-9/_?=&.%#:~-]*)?$'
  );
