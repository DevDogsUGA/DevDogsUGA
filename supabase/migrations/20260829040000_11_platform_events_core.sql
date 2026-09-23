-- Events core: meetings, workshops, seasons and competitions.
--
-- Nothing here is written by a client. Meetings and workshops are authored as
-- config-as-code (`@devdogsuga/club-config`) and arrive through
-- `server/config/reconcile.ts`, which runs server-side as the owning role and
-- is not subject to RLS. Every check constraint below is a BACKSTOP behind
-- `@devdogsuga/club-config`'s `validator.ts` rather than the enforcement
-- itself. The rule that follows is the one thing to carry away from this
-- file: a constraint here must never be STRICTER than the validator upstream
-- of it. A value the validator publishes and the database rejects is not a
-- caught error, it is a constraint violation inside the reconcile, and for
-- the config path that aborts the WHOLE reconcile rather than one row -- see
-- `reconcile.ts`'s header for why partial application is refused outright.
-- Widening a list here means widening the validator's constant in the same
-- change.
--
-- ## The shape
--
--   meetings ──< workshops (one per project, running in parallel)
--
-- A competition is NOT an event, and is no longer a child of a workshop or a
-- meeting at all -- see the competitions table's own header below for what it
-- is now. An earlier draft modelled meetings, workshops and competitions as
-- one `sessions` table with an (event, track, stage) discriminator, which
-- mixed things you ATTEND with things that merely have a DURATION and so
-- could not answer "was this member present?". Splitting the two removed the
-- discriminator entirely, which is why there is no `eventStage` enum.
--
-- The meeting is the only one of these a member can be PRESENT at, which is
-- why attendance keys to it.
--
-- ## `configId`
--
-- `configId` is the identity `server/config/reconcile.ts` upserts and
-- archives on: a stable id, authored once and never recomputed, that
-- survives a rename.
--
-- ## Enums are not here
--
-- `checkInMethod` is declared with attendance, its only consumer. `teamRole`,
-- `membershipDirection` and `membershipRequestStatus` are declared with
-- teams. No table in this file uses any of them.

-- ============================================================
-- Seasons
-- ============================================================
--
-- Semester boundaries are data, not date arithmetic hidden in application
-- code. A meeting normally resolves its season from its start timestamp; the
-- nullable seasonId on it is an explicit config-authored override for
-- exceptional calendars.
create table "platform"."seasons" (
  "id"       uuid not null default gen_random_uuid(),
  "name"     text not null,
  "startsAt" timestamptz not null,
  "endsAt"   timestamptz not null,
  constraint "seasons_pkey" primary key ("id"),
  constraint "seasons_name_key" unique ("name"),
  constraint "seasons_endsAt_after_startsAt" check ("endsAt" > "startsAt")
);

alter table "platform"."seasons" enable row level security;

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
-- Every officer-authored column here is nullable, because most of them are
-- genuinely optional in config itself -- a night with no kind override, no
-- RSVP link, no summary -- not because a write landed only partway.
--
-- `configId` is what survives a retitle: matching on name or slug instead
-- breaks the first time somebody fixes a typo, and breaks in the worst way --
-- a second row that looks right, while the credit already earned stays on
-- the first.
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
  -- The config-as-code identity: `@devdogsuga/club-config`'s authored `id`
  -- for this meeting. Unique only among LIVE rows (see the partial index
  -- below), so a config item that is retired and later reused -- unlikely,
  -- but the id namespace is the author's to manage, not this schema's -- does
  -- not collide with the archived row it replaces.
  "configId"           text,
  -- Where to send a member after a successful check-in. Null is the ordinary
  -- case: most nights have nothing to redirect to.
  "surveyUrl"          text,
  "deletedAt"          timestamptz,
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
  -- The single flag that governs both star credit and EL eligibility.
  -- Was two independent columns (`countsTowardProgress`, `elEligible`) until
  -- the config-as-code cutover merged them: nothing in two years of data ever
  -- set them differently, and carrying two booleans that always agreed was
  -- two things to keep in sync for one real decision -- "does this meeting
  -- count". `memberStars`, `getAttendanceMeetings` and the reflection-
  -- eligibility readers all key on this one column now.
  "countsForCredit"    boolean not null default false,
  "seasonId"             uuid,
  constraint "meetings_pkey" primary key ("id"),
  constraint "meetings_slug_key" unique ("slug"),
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
  -- The backstop for the config schema's closed enum. Spelled as a list
  -- rather than a Postgres enum on purpose: this list is expected to keep
  -- moving, and an enum makes each move a migration with a transaction
  -- caveat instead of one line in a check. The values are Title Case
  -- display strings because the stored value is both what officers pick and
  -- what the chip prints verbatim, which is what lets an unrecognised value
  -- render as itself.
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
  -- Every value has a footprint generated from OpenStreetMap by
  -- `apps/platform/scripts/generate-campus-map.ts`, which is where the
  -- canonical list lives. Adding a building is three things that move
  -- together and a deploy rather than a click: this list,
  -- MEETING_BUILDING_CHOICES in `@devdogsuga/club-config`'s schema, and the
  -- HIGHLIGHTS table in that script, re-run, since a building with no
  -- footprint is a pin over nothing.
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
  ),
  constraint "meetings_seasonId_fkey" foreign key ("seasonId")
    references "platform"."seasons"("id") on update cascade on delete set null
);

alter table "platform"."meetings" enable row level security;

comment on column "platform"."meetings"."nameOverride" is
  'A name for this night, when it has one worth reading -- "Cold Start", "Midterm Study Session". Null is the ORDINARY case: a sprint Monday derives its heading from its workshops and judging, and rendering a hand-written restatement of that beside it would be the same information twice from two sources. Authored in config as a meeting''s "title" -- irregular events only.';

comment on column "platform"."meetings"."location" is
  'Where inside "building" -- a room number or the name of a space. Free text, authored in config. Printed beside the building; never parsed to decide anything.';

comment on column "platform"."meetings"."summary" is
  'One or two sentences about this meeting, authored in config. Null means none was written, and the events page shows a derived agenda instead. Capped at 240 characters; longer text fails the config validator rather than being truncated.';

comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Build Session, Study Session, Interest Meeting, or Social. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';

comment on column "platform"."meetings"."rsvpUrl" is
  'Per-meeting RSVP link, normally the meeting''s UGA Involvement Network event page. Authored in config; null when there is nothing to RSVP to.';

comment on column "platform"."meetings"."building" is
  'Which building this meeting is in, from the closed list the campus map can draw. Null means nobody has picked one; ''Other'' means somewhere the map does not cover, and the free-text "location" beside it carries the detail either way.';

comment on column "platform"."meetings"."cancelledAt" is
  'When this meeting was called off. Null is the ordinary case. Distinct from "deletedAt", which archives a row authored in error: a cancelled meeting is still shown -- struck through, with its reason -- on every surface that is a SCHEDULE, and hidden only from the surfaces that answer "where should I go now".';

comment on column "platform"."meetings"."cancellationReason" is
  'Why, in a few words -- "no sprint this week", "campus closed". Null even when "cancelledAt" is set, because the fact and the explanation arrive in separate keystrokes and the page can state the fact without it.';

comment on column "platform"."meetings"."configId" is
  'The stable id `@devdogsuga/club-config` authors for this meeting. `server/config/reconcile.ts` upserts and archives on this column; unique only among live rows, via a partial index below, so an archived id can be reused. Null for a row nothing in config has ever named.';

comment on column "platform"."meetings"."surveyUrl" is
  'Where to send a member after a successful check-in at this meeting. Null is the ordinary case -- most nights have nothing to redirect to.';

-- ============================================================
-- Workshops
-- ============================================================
--
-- One meeting runs several workshops in parallel, and a member attends
-- exactly one of them.
--
-- `title` is what the page prints, falling back to `project` when null.
-- Officers say "Workshop (Supabase)" while the recommendation reads
-- "DogDays", so without this column the schedule and the page use different
-- words for the same night.
create table "platform"."workshops" (
  "id"               uuid not null default gen_random_uuid(),
  "meetingId"        uuid not null,
  -- Free text, and no foreign key -- the `projects` table this used to
  -- reference is gone. A workshop recommends a body of work in words now
  -- ("DogDays", "DogDays & DogPack"), the same way an officer would say it
  -- out loud at the meeting, with nothing to keep in sync across a rename.
  -- Nullable so a workshop can still teach a skill rather than a codebase:
  -- "Workshop (Career Fair Readiness)" recommends nothing, and inventing a
  -- recommendation for it would be worse than leaving the field blank.
  "project"          text,
  -- The config-as-code identity, mirroring `meetings.configId`: the authored
  -- `id` of this workshop's entry in a meeting's agenda. Unique only among
  -- live rows.
  "configId"         text,
  "deletedAt"        timestamptz,
  "title"            text,
  "description"      text,
  constraint "workshops_pkey" primary key ("id"),
  -- Denormalized composite key. Postgres can only point a foreign key at a
  -- unique constraint, so this exists purely so `attendance` can declare
  --   foreign key ("workshopId", "meetingId") -> workshops(id, "meetingId")
  -- and have the database reject an attendance row whose workshop belongs to
  -- some other meeting. It looks redundant beside the pkey and is not:
  -- dropping it breaks the attendance table's FK.
  constraint "workshops_id_meetingId_key" unique ("id", "meetingId"),
  constraint "workshops_title_length"
    check ("title" is null or char_length("title") <= 80),
  constraint "workshops_description_length"
    check ("description" is null or char_length("description") <= 280),
  constraint "workshops_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete cascade
);

alter table "platform"."workshops" enable row level security;

comment on column "platform"."workshops"."title" is
  'What this workshop is called, in the officers'' own vocabulary -- "Supabase", "Next.js", "Career Fair Readiness". Null falls back to "project", so every workshop authored before this column keeps rendering exactly as it did.';

comment on column "platform"."workshops"."description" is
  'One or two sentences on what this workshop teaches, shown in the meeting''s detail dialog. Null renders nothing. Workshops are self-contained and assume no prior work, which is the single most useful thing a prospective member can learn here -- so this is worth writing even when the title is self-explanatory.';

comment on column "platform"."workshops"."project" is
  'The long-running body of work this workshop recommends, as free text -- "DogDays", "DogDays & DogPack" -- or null when it teaches a skill rather than a codebase. Authored in config; there is no projects table to look this up in any more.';

comment on column "platform"."workshops"."configId" is
  'The stable id `@devdogsuga/club-config` authors for this workshop, within its meeting''s agenda. `server/config/reconcile.ts` upserts and archives on this column; unique only among live rows.';

-- ============================================================
-- Competitions
-- ============================================================
--
-- A competition IS an issue mirror, not a schedule item. The source of truth
-- is a draft item in the private "Competitions" GitHub Project: custom fields
-- hold display metadata, the item body holds the markdown brief. Converting
-- the draft into a real issue in `GITHUB_ORG/GITHUB_COMPETITION_REPO` is
-- KICKOFF, and that conversion is what `server/github/competitions.ts` mirrors
-- here -- see that module's header for the full ingestion story (the GraphQL
-- read, the Project-shape drift check, the webhook and nightly-reconcile
-- triggers). A row in this table only ever exists for a CONVERTED item; a
-- still-draft item in the Project is not a competition yet and has no row.
--
-- Nothing here is meeting- or workshop-scoped any more. The platform
-- redesign's competitions step deleted the whole "a competition is a
-- week-long window bracketed by two meetings" apparatus --
-- `workshopId`/`judgingMeetingId`/`judgingStartsAt` and everything they
-- drove (roster-lock-at-judging, the star-freeze pass, judging-meeting
-- straddle) -- because a competition is now an asynchronous GitHub issue with
-- no fixed night. `plannedEndAt` is what is left of "when does this end":
-- display-only, authored by an officer in the Project's date field, and
-- never read by any lock or deadline logic. The only real dates are
-- `kickedOffAt` (when the draft became an issue) and `closedAt` (when the
-- issue closed, i.e. the competition is over).
create table "platform"."competitions" (
  "id"             uuid not null default gen_random_uuid(),
  -- GitHub's own identity for the issue, which is what a Project item's
  -- `content` resolves to once it is converted. Unique because the mirror is
  -- one row per issue; re-ingesting the same item (a redelivered webhook, a
  -- nightly reconcile pass) upserts on this column rather than duplicating.
  "issueNodeId"    text not null,
  "issueNumber"    integer not null,
  -- `owner/repo`, e.g. "DevDogsUGA/DevDogsUGA" -- the competition repo an
  -- entry's PR and this issue both live in. Stored rather than assumed from
  -- `GITHUB_COMPETITION_REPO` so a mirrored row still reads correctly if that
  -- env var is ever repointed.
  "repo"           text not null,
  "url"            text not null,
  -- User-visible and has to be stable and unique across the repo: it is what
  -- names the competition everywhere outside this table (URLs, results
  -- pages), the way `teams"."slug"` names a team. Derived from the title and
  -- the issue number at ingestion time -- see `slugForCompetition` in
  -- `server/github/competitions.ts` -- rather than officer-authored, since
  -- nothing here is a form field any more.
  "slug"           text not null,
  -- From the Project's "Title" field when an officer filled one in, falling
  -- back to the issue's own title. Never null: a converted issue always has
  -- a title, one way or the other.
  "title"          text not null,
  -- The issue body, markdown, rendered with the site's existing markdown
  -- renderer. Null only for an issue with an empty body, which GitHub allows.
  "brief"          text,
  -- The Project's planned judging/end date field. DISPLAY-ONLY: nothing here
  -- reads it to decide whether entries are still open or a deadline has
  -- passed. That is `closedAt`'s job.
  "plannedEndAt"   timestamptz,
  "kickedOffAt"    timestamptz not null,
  "closedAt"       timestamptz,
  "githubSyncedAt" timestamptz not null default now(),
  constraint "competitions_pkey" primary key ("id"),
  constraint "competitions_issueNodeId_key" unique ("issueNodeId"),
  constraint "competitions_slug_key" unique ("slug"),
  -- Generous relative to a workshop or meeting heading: this is a GitHub
  -- issue title, typed in an issue form rather than a length-checked field on
  -- this platform, and GitHub itself allows up to 256 characters. 160 is
  -- comfortably under that while still keeping the results page's heading to
  -- one line.
  constraint "competitions_title_length" check (char_length("title") <= 160)
);

alter table "platform"."competitions" enable row level security;

comment on column "platform"."competitions"."title" is
  'From the Project''s "Title" field, falling back to the issue''s own title. Refreshed on every `edited` projects_v2_item webhook and by the nightly reconcile, so an officer retitling the issue or the field updates this column instead of orphaning it.';

comment on column "platform"."competitions"."brief" is
  'The issue body, markdown. This is the competition''s brief -- what officers write when they draft the item, before it is ever converted.';

comment on column "platform"."competitions"."plannedEndAt" is
  'The Project''s planned judging/end date field. Display-only: shown on the competition page as a heads-up, never read to gate entries or compute a deadline. `closedAt` is the real "is this over" signal.';

comment on column "platform"."competitions"."kickedOffAt" is
  'When the draft Project item was converted into this issue -- the moment `server/github/competitions.ts` calls kickoff. Not the issue''s own `createdAt`: a draft can sit in the Project for a while before conversion.';

comment on column "platform"."competitions"."closedAt" is
  'When the issue closed. Null means the competition is still open. This is the one clock the platform reads for "is this competition over" -- `plannedEndAt` never is.';

comment on column "platform"."competitions"."githubSyncedAt" is
  'Last time something confirmed this row against GitHub: an ingestion call from the webhook route, or the nightly `github-reconcile` cron paging the Project. Mirrors `teams."githubSyncedAt"''s freshness role.';

-- ============================================================
-- Live-row indexes
-- ============================================================
--
-- Every public read filters on `"deletedAt" is null`, and the archived rows
-- are a rounding error against the live ones, so these are partial.

create index "meetings_live_idx" on "platform"."meetings" ("startsAt")
  where "deletedAt" is null;
create index "workshops_live_idx" on "platform"."workshops" ("meetingId")
  where "deletedAt" is null;
create index "seasons_startsAt_idx" on "platform"."seasons" ("startsAt");

-- Competitions has no `deletedAt` -- there is no soft-archive state for a
-- mirror row, only "still tracking" (see `server/github/competitions.ts` on
-- what a `deleted`/`archived` Project item does instead). `kickedOffAt` is
-- what every listing orders by, newest first.
create index "competitions_kickedOffAt_idx"
  on "platform"."competitions" ("kickedOffAt" desc);

-- The config-as-code identity. Partial and unique, rather than a plain unique
-- constraint, because an archived row's id has to be free for reuse: a plain
-- unique constraint would keep a retired id claimed forever by a row nobody
-- can see. Also what makes these lookups indexed rather than sequential
-- scans -- both tables' reconcile does one per config item, every run.
create unique index "meetings_configId_live_key" on "platform"."meetings" ("configId")
  where "deletedAt" is null;
create unique index "workshops_configId_live_key" on "platform"."workshops" ("configId")
  where "deletedAt" is null;

-- ============================================================
-- RLS
-- ============================================================
--
-- The schedule is public information. The marketing site lists meetings and
-- the workshops they run to logged-out visitors, so `anon` reads all three.
--
-- Every write is denied to clients. The config reconcile and the
-- competitions ingestion (`server/github/competitions.ts`) both write as the
-- owning role and are not subject to RLS at all, so denying client writes
-- costs nothing and is not belt-and-braces: one
-- publishable key reaches this schema from any browser, and these policies
-- are the only thing between that key and the schedule. The schema-wide
-- default privileges from the first migration grant ALL on these tables to
-- anon and authenticated.
--
-- The deny is split per command instead of one restrictive `for all using
-- (false)`, because a restrictive `for all` also applies to SELECT and would
-- silently override the public_select above it. Do not fold these into four.
--
-- The same four policy names repeat on every table below. Policy names are
-- per-table, so this is legal, and deduplicating by name deletes real
-- policies.

create policy "public_select" on "platform"."seasons"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."seasons"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."seasons"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."seasons"
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
