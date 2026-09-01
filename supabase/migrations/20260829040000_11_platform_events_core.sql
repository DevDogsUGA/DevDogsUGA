-- Events core: projects, meetings, workshops and competitions.
--
-- Nothing here is written by a client. All four tables are authored by
-- officers in Airtable and arrive through the sync, which runs server-side as
-- the owning role and is not subject to RLS. So every check constraint below
-- is a BACKSTOP behind a parser in `packages/airtable/src/registry.ts` and
-- `checkMeeting` in `apps/platform/src/server/airtable/refusals.ts`, and the
-- rule that follows is the one thing to carry away from this file: a
-- constraint here must never be STRICTER than its parser. A value the parser
-- publishes and the database rejects is not a refused field, it is a
-- constraint violation inside the pull, and that aborts the whole sync pass
-- for every table until somebody edits the offending Airtable cell. Widening
-- a list here means widening the parser constant in the same change.
--
-- ## The shape
--
--   meetings ──< workshops (one per project, running in parallel)
--                    │
--                    └──< competitions (one per workshop, week-long)
--
-- A competition is NOT an event. A feature is announced after a workshop,
-- teams get most of a week to build it, and judging happens immediately
-- before the NEXT workshop. So a competition is a week-long asynchronous
-- window bracketed by two in-person moments belonging to different meetings,
-- and a meeting straddles two competitions. An earlier draft modelled all of
-- it as one `sessions` table with an (event, track, stage) discriminator,
-- which mixed things you ATTEND with things that merely have a DURATION and
-- so could not answer "was this member present?". Splitting the two removed
-- the discriminator entirely, which is why there is no `eventStage` enum.
--
-- The meeting is the only one of the four a member can be PRESENT at, which
-- is why attendance keys to it.
--
-- ## Enums are not here
--
-- `checkInMethod` is declared with attendance, its only consumer. `teamRole`,
-- `submissionState`, `membershipDirection` and `membershipRequestStatus` are
-- declared with teams. No table in this file uses any of them.

-- ============================================================
-- Projects
-- ============================================================
--
-- A long-running body of work that workshops teach against: "the platform",
-- "the schedule builder". Its own table rather than a text column on the
-- workshop, because the same project runs across many meetings and its name
-- has to stay editable in one place.
--
-- `appId` is nullable and that is the point. A project is not an app: it can
-- exist before anything is deployed, and several projects can target one app.
-- The reference is for surfaces that link a workshop to the thing it ships,
-- not an identity claim. It also means this file has to run after the app
-- registry.
--
-- Officer-authored in Airtable, like the three tables below it, which it was
-- NOT at first: it was platform-authored and pushed, the only table here that
-- moved that direction. Nothing wrote it. There was no console page, no
-- action, no seed, and RLS denies every client write, so the only inserts in
-- the repo were test fixtures -- while `pullWorkshops` required a project link
-- to resolve before it would create a workshop. An officer typing a project
-- name into Airtable's link picker got a row with no `⚙️ Platform ID`, which
-- `projectIdMap` could not adopt and never would, so their workshop was
-- skipped on every pass. The direction was the cause and this is the fix: the
-- table now arrives the same way meetings and workshops do.
--
-- `slug` is DERIVED on insert from the display name and never recomputed, the
-- same rule `meetings.slug` follows and for a sharper reason: `stars.csv` is
-- keyed on it across semesters, so regenerating it on a rename would rewrite
-- history that has already been exported.
create table "platform"."projects" (
  "id"               uuid not null default gen_random_uuid(),
  "slug"             text not null,
  "displayName"      text not null,
  "appId"            uuid,
  "sortOrder"        double precision not null default 0,
  -- The same pair every officer-authored table here carries, and for the same
  -- reasons: identity that survives a rename, and an archive rather than a
  -- delete. The archive matters more here than anywhere except attendance --
  -- `memberStars` groups on the workshop's `projectId`, so hard-deleting a
  -- project an officer removed by mistake would drop the project off stars
  -- members had already earned.
  "airtableRecordId" text,
  "deletedAt"        timestamptz,
  constraint "projects_pkey" primary key ("id"),
  constraint "projects_slug_key" unique ("slug"),
  constraint "projects_airtableRecordId_key" unique ("airtableRecordId"),
  -- A cap this column did not need while the platform wrote it, and needs now
  -- that an officer does. The name is printed as a chip on the schedule and as
  -- a star's label, so an unbounded string is a broken layout on a public
  -- page. 80 matches `workshops_title_length`; both are row labels.
  -- `PROJECT_NAME_MAX_LENGTH` in the registry is the parser in front of it.
  constraint "projects_displayName_length" check (length("displayName") <= 80),
  constraint "projects_appId_fkey" foreign key ("appId")
    references "platform"."apps"("id") on update cascade on delete set null
);

alter table "platform"."projects" enable row level security;

-- ============================================================
-- Meetings
-- ============================================================
--
-- The in-person moment. Two cadences run through this one table: Monday is
-- the sprint spine, Wednesday is a support night whose content varies with
-- the sprint. There is deliberately no `track` or `type` column for that.
-- `kind` already answers it, and a night that runs workshops is already a
-- workshop night because its workshops say so. Storing the same fact twice
-- guarantees the two copies disagree the first time somebody edits one.
--
-- Every officer-authored column here is nullable, and the sync's completeness
-- check deliberately ignores all of them: officers fill Airtable fields one
-- keystroke at a time, and a pass landing between two of them must not
-- complain.
--
-- `airtableRecordId` is the single most important detail in the integration.
-- Airtable record IDs survive renames, field edits and view re-sorts, so an
-- officer retitling "Sprint 2" updates this row instead of orphaning every
-- attendance record pointing at it. Matching on name or slug instead breaks
-- the first time somebody fixes a typo, and breaks in the worst way: a second
-- row that looks right, while the credit already earned stays on the first.
--
-- `deletedAt` is a soft archive, never a hard delete. A meeting with
-- attendance rows is a record of who was in a room on a Tuesday, and "I
-- deleted the wrong row" in a spreadsheet must not erase that.
--
-- `cancelledAt` is a different fact from `deletedAt` and the pair is the
-- whole reason both exist. Archived means "this was never real" and is hidden
-- everywhere; cancelled means "this was real and is not happening", and stays
-- visible, struck through, on every surface that is a SCHEDULE. Before the
-- split, cancelling next Wednesday made it vanish and members walked to the
-- building anyway.
create table "platform"."meetings" (
  "id"                 uuid not null default gen_random_uuid(),
  -- Derived from the meeting's DATE in EVENT_TZ, never from toISOString():
  -- the UTC date rolls at 20:00 Eastern, so a 20:00 social would be filed a
  -- day late. Deriving it from the rendered heading was rejected because that
  -- string moves when a workshop is added, and a slug is a URL.
  "slug"               text not null,
  -- A name only when the night has one worth reading. Null is ordinary: a
  -- sprint Monday derives its heading from its workshops and judging, and an
  -- officer hand-retyping that prose weekly was wrong the first week they
  -- forgot a clause.
  "nameOverride"       text,
  "location"           text,
  "startsAt"           timestamptz not null,
  "endsAt"             timestamptz not null,
  "airtableRecordId"   text,
  "deletedAt"          timestamptz,
  "attendanceFormUrl"  text,
  "summary"            text,
  "kind"               text,
  "rsvpUrl"            text,
  -- The building as a fact rather than a guess. `location` used to carry the
  -- whole answer as free text ("DLW 124") and the events page had started
  -- regexing it to decide whether to offer directions, failing closed so
  -- "DLW124" quietly got no button. The closed list below is exactly the set
  -- the campus map has footprints for.
  "building"           text,
  "cancelledAt"        timestamptz,
  "cancellationReason" text,
  constraint "meetings_pkey" primary key ("id"),
  constraint "meetings_slug_key" unique ("slug"),
  constraint "meetings_airtableRecordId_key" unique ("airtableRecordId"),
  constraint "meetings_endsAt_after_startsAt" check ("endsAt" > "startsAt"),
  -- Roughly two sentences, which is what the events card is laid out for. The
  -- number matters less than something enforcing it: without a cap, a summary
  -- that outgrows its card is found by a member looking at a broken page
  -- rather than by the officer who wrote it. Measured with char_length on the
  -- normalized text, the same text the parser measures and the card lays out.
  constraint "meetings_summary_length" check (
    "summary" is null
    or char_length("summary") <= 240
  ),
  -- The backstop for the Airtable single select. Spelled as a list rather
  -- than an enum on purpose: this list is expected to keep moving, and an
  -- enum makes each move a migration with a transaction caveat instead of one
  -- line in a check. The values are Title Case display strings because the
  -- stored value is both what officers pick and what the chip prints
  -- verbatim, which is what lets an unrecognised value render as itself.
  constraint "meetings_kind_choices" check (
    "kind" is null
    or "kind" in ('Build Session', 'Study Session', 'Interest Meeting', 'Social')
  ),
  -- Rendered as an href on a public page under the club's name, so a
  -- mispaste points members somewhere else entirely and nobody can tell. The
  -- host is allowlisted rather than just the scheme. https only, because an
  -- http link on a TLS page is a downgrade and `javascript:` has no business
  -- in an href. The path is optional, matching the parser. The character
  -- class excludes '@', which is what keeps a credential-carrying URL such as
  -- https://someone@uga.campuslabs.com/x out of the column: new URL() parses
  -- it happily and its hostname is allowlisted. Adding a host here means
  -- editing RSVP_URL_ALLOWED_HOSTS in the same change.
  constraint "meetings_rsvpUrl_host" check (
    "rsvpUrl" is null
    or "rsvpUrl" ~ '^https://uga\.campuslabs\.com(/[A-Za-z0-9/_?=&.%#:~-]*)?$'
  ),
  -- Same reasoning as the RSVP host: this is an href on a public page, and
  -- constraining the host makes a mispaste a rejected write instead of a link
  -- nobody thinks to check.
  constraint "meetings_attendanceFormUrl_airtable" check (
    "attendanceFormUrl" is null
    or "attendanceFormUrl" ~ '^https://airtable\.com/[A-Za-z0-9/_?=&.-]+$'
  ),
  -- Every value has a footprint generated from OpenStreetMap by
  -- `apps/platform/scripts/generate-campus-map.ts`, which is where the
  -- canonical list lives. Adding a building is three things that move
  -- together and a deploy rather than a click: this list,
  -- MEETING_BUILDING_CHOICES in the registry parser, and the HIGHLIGHTS table
  -- in that script, re-run, since a building with no footprint is a pin over
  -- nothing. The Airtable select has to be widened by hand as well, because
  -- the scaffolder is create-only.
  constraint "meetings_building_choices" check (
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
  ),
  -- Shorter than the summary cap because this renders inline beside a
  -- struck-through row rather than in a paragraph of its own.
  constraint "meetings_cancellationReason_length" check (
    "cancellationReason" is null
    or char_length("cancellationReason") <= 160
  ),
  -- The explanation cannot outlive the fact. A reason with no cancellation is
  -- a row nothing renders and nobody can find to correct. The reverse is the
  -- normal half-filled state of any officer-authored pair, and is allowed.
  constraint "meetings_cancellationReason_needs_cancellation" check (
    "cancellationReason" is null
    or "cancelledAt" is not null
  ),
  -- Laid out as a single line in a schedule row and in a dialog title.
  constraint "meetings_nameOverride_length" check (
    "nameOverride" is null
    or char_length("nameOverride") <= 80
  )
);

alter table "platform"."meetings" enable row level security;

comment on column "platform"."meetings"."nameOverride" is
  'A name for this night, when it has one worth reading -- "Cold Start", "Midterm Study Session". Null is the ORDINARY case: a sprint Monday derives its heading from its workshops and judging, and rendering a hand-written restatement of that beside it would be the same information twice from two sources. Authored in Airtable as "Custom name -- irregular events only".';

comment on column "platform"."meetings"."location" is
  'Where inside "building" -- a room number or the name of a space. Free text, authored in Airtable. Printed beside the building; never parsed to decide anything.';

comment on column "platform"."meetings"."attendanceFormUrl" is
  'Share link for this meeting''s Airtable attendance form. Pulled from Airtable; null when there is no form. Not discoverable via the API — a form view''s share token is not exposed.';

comment on column "platform"."meetings"."summary" is
  'One or two sentences about this meeting, authored by an officer in Airtable. Null means none was written, and the events page shows a derived agenda instead. Capped at 240 characters; longer text is refused rather than truncated.';

comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Build Session, Study Session, Interest Meeting, or Social. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';

comment on column "platform"."meetings"."rsvpUrl" is
  'Per-meeting RSVP link, normally the meeting''s UGA Involvement Network event page. Pulled from Airtable; null when there is nothing to RSVP to. Distinct from "attendanceFormUrl", which is the in-room check-in form.';

comment on column "platform"."meetings"."building" is
  'Which building this meeting is in, from the closed list the campus map can draw. Null means nobody has picked one; ''Other'' means somewhere the map does not cover, and the free-text "location" beside it carries the detail either way.';

comment on column "platform"."meetings"."cancelledAt" is
  'When this meeting was called off. Null is the ordinary case. Distinct from "deletedAt", which archives a row authored in error: a cancelled meeting is still shown -- struck through, with its reason -- on every surface that is a SCHEDULE, and hidden only from the surfaces that answer "where should I go now".';

comment on column "platform"."meetings"."cancellationReason" is
  'Why, in a few words -- "no sprint this week", "campus closed". Null even when "cancelledAt" is set, because the fact and the explanation arrive in separate keystrokes and the page can state the fact without it.';

-- ============================================================
-- Workshops
-- ============================================================
--
-- One meeting runs several workshops in parallel, and a member attends
-- exactly one of them.
--
-- `title` is what the page prints, falling back to the project's display name
-- when null. Officers say "Workshop (Supabase)" while the project is called
-- "Platform", so without this column the schedule and the page use different
-- words for the same night.
create table "platform"."workshops" (
  "id"               uuid not null default gen_random_uuid(),
  "meetingId"        uuid not null,
  -- Nullable, so a workshop can teach a skill rather than a codebase.
  -- "Workshop (Career Fair Readiness)" has no project and inventing one would
  -- put it on the Projects page as work the club does not do. The cost is
  -- paid in the loaders: every read of this table LEFT joins projects, and an
  -- inner join makes a project-less workshop vanish silently on exactly the
  -- night this column was added for.
  "projectId"        uuid,
  "airtableRecordId" text,
  "deletedAt"        timestamptz,
  "title"            text,
  "description"      text,
  constraint "workshops_pkey" primary key ("id"),
  constraint "workshops_meetingId_projectId_key" unique ("meetingId", "projectId"),
  -- Denormalized composite key. Postgres can only point a foreign key at a
  -- unique constraint, so this exists purely so `attendance` can declare
  --   foreign key ("workshopId", "meetingId") -> workshops(id, "meetingId")
  -- and have the database reject an attendance row whose workshop belongs to
  -- some other meeting. It looks redundant beside the pkey and is not:
  -- dropping it breaks the attendance table's FK.
  constraint "workshops_id_meetingId_key" unique ("id", "meetingId"),
  constraint "workshops_airtableRecordId_key" unique ("airtableRecordId"),
  constraint "workshops_title_length"
    check ("title" is null or char_length("title") <= 80),
  constraint "workshops_description_length"
    check ("description" is null or char_length("description") <= 280),
  constraint "workshops_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete cascade,
  constraint "workshops_projectId_fkey" foreign key ("projectId")
    references "platform"."projects"("id") on update cascade on delete restrict
);

alter table "platform"."workshops" enable row level security;

comment on column "platform"."workshops"."title" is
  'What this workshop is called, in the officers'' own vocabulary -- "Supabase", "Next.js", "Career Fair Readiness". Null falls back to the project''s display name, so every workshop authored before this column keeps rendering exactly as it did.';

comment on column "platform"."workshops"."description" is
  'One or two sentences on what this workshop teaches, shown in the meeting''s detail dialog. Null renders nothing. Workshops are self-contained and assume no prior work, which is the single most useful thing a prospective member can learn here -- so this is worth writing even when the title is self-explanatory.';

comment on column "platform"."workshops"."projectId" is
  'The long-running body of work this workshop teaches against, or null when it teaches a skill rather than a codebase -- a career-readiness session belongs to no project and must not invent one. Every read of this table left-joins "projects" for that reason.';

-- ============================================================
-- Competitions
-- ============================================================
--
-- The week-long window opened by a workshop. One per workshop, hence the
-- unique on "workshopId" rather than a plain reference.
create table "platform"."competitions" (
  "id"               uuid not null default gen_random_uuid(),
  -- Names the integration branch teams open their PRs against, so it is
  -- user-visible in git and has to be stable and unique across the repo.
  "slug"             text not null,
  "workshopId"       uuid not null,
  -- Judging belongs to a LATER meeting than the workshop that opened the
  -- competition. Both of these are nullable because officers author them in
  -- Airtable one field at a time; null means "not yet scheduled", which the
  -- officer surface should show rather than the database refuse. Deliberately
  -- NOT constrained to be set together: an earlier draft required
  -- ("judgingStartsAt" is null) = ("judgingMeetingId" is null) and made the
  -- half-filled state unrepresentable, turning normal data entry into a write
  -- error. Do not resurrect it.
  "judgingMeetingId" uuid,
  "judgingStartsAt"  timestamptz,
  -- Null falls back to DEFAULT_MAX_TEAM_SIZE in server/teams/limits.ts. This
  -- was briefly a column on a singleton platform."instance" table, on the
  -- reasoning that team size is a club decision rather than a constant, but
  -- nothing ever wrote it and no surface existed to change it. A
  -- configuration point with no way to configure it is a constant kept
  -- somewhere harder to read.
  "maxTeamSize"      smallint,
  -- Null = not yet graded. Officers fill this in through Airtable once they
  -- have decided what the feature required.
  "requirementCount" smallint,
  "airtableRecordId" text,
  "deletedAt"        timestamptz,
  constraint "competitions_pkey" primary key ("id"),
  constraint "competitions_slug_key" unique ("slug"),
  constraint "competitions_workshopId_key" unique ("workshopId"),
  constraint "competitions_airtableRecordId_key" unique ("airtableRecordId"),
  constraint "competitions_requirementCount_nonneg"
    check ("requirementCount" is null or "requirementCount" >= 0),
  constraint "competitions_maxTeamSize_positive"
    check ("maxTeamSize" is null or "maxTeamSize" > 0),
  constraint "competitions_workshopId_fkey" foreign key ("workshopId")
    references "platform"."workshops"("id") on update cascade on delete cascade,
  constraint "competitions_judgingMeetingId_fkey" foreign key ("judgingMeetingId")
    references "platform"."meetings"("id") on update cascade on delete set null
);

alter table "platform"."competitions" enable row level security;

-- ============================================================
-- Live-row indexes
-- ============================================================
--
-- Every public read filters on `"deletedAt" is null`, and the archived rows
-- are a rounding error against the live ones, so these are partial.

create index "projects_live_idx" on "platform"."projects" ("sortOrder")
  where "deletedAt" is null;
create index "meetings_live_idx" on "platform"."meetings" ("startsAt")
  where "deletedAt" is null;
create index "workshops_live_idx" on "platform"."workshops" ("meetingId")
  where "deletedAt" is null;
create index "competitions_live_idx" on "platform"."competitions" ("workshopId")
  where "deletedAt" is null;

-- ============================================================
-- RLS
-- ============================================================
--
-- The schedule is public information. The marketing site lists meetings and
-- the projects they cover to logged-out visitors, so `anon` reads all four.
--
-- Every write is denied to clients. The sync writes as the owning role and is
-- not subject to RLS at all, so denying client writes costs nothing and is
-- not belt-and-braces: one publishable key reaches this schema from any
-- browser, and these policies are the only thing between that key and the
-- schedule. The schema-wide default privileges from the first migration grant
-- ALL on these tables to anon and authenticated.
--
-- The deny is split per command instead of one restrictive `for all using
-- (false)`, because a restrictive `for all` also applies to SELECT and would
-- silently override the public_select above it. Do not fold these twelve
-- policies into four.
--
-- The same four policy names repeat on all four tables. Policy names are
-- per-table, so this is legal, and deduplicating by name deletes real
-- policies.

create policy "public_select" on "platform"."projects"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."projects"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."projects"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."projects"
  as restrictive for delete to anon, authenticated using (false);

create policy "public_select" on "platform"."meetings"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."meetings"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."meetings"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."meetings"
  as restrictive for delete to anon, authenticated using (false);

create policy "public_select" on "platform"."workshops"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."workshops"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."workshops"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."workshops"
  as restrictive for delete to anon, authenticated using (false);

create policy "public_select" on "platform"."competitions"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."competitions"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."competitions"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."competitions"
  as restrictive for delete to anon, authenticated using (false);
