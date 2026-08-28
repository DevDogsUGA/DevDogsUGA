-- ============================================================
-- The events rework: a second cadence, and a name only when there is one
-- ============================================================
--
-- `platform.meetings` was shaped around one axiom -- that a meeting is the
-- weekly Monday night, hosting parallel per-project workshops and judging the
-- competition that opened a week earlier. That axiom is now wrong in two
-- directions at once, and this migration is what the schema needs in order to
-- stop guessing.
--
-- The club runs TWO cadences. Monday is the sprint spine. Wednesday is a
-- support night -- a build session while a sprint is running, a study session
-- when one is not, and cancelled when neither fits. Nothing in the schema
-- could say that: a Wednesday with no workshops derived `open`, which
-- `meetingView` labelled "Open build", so an interest meeting, a setup night
-- and a midterm study session all rendered as the same amber chip. Run the
-- autumn schedule through `resolveMeetingSegments` as it stood and two of
-- eight nights came out right.
--
-- The fix is NOT a `type` column. That was considered and rejected for the
-- same reason `20260808000001` rejected it: a night that runs workshops is
-- already a workshop night, and storing that fact twice guarantees the two
-- copies disagree. What is added here is only what structure cannot say --
-- which is also why `kind`, already the designated place for exactly that,
-- does most of the work and gains no new mechanism, only new values.
--
-- ## What is NOT here, deliberately
--
-- No `track` column. It would answer "which cadence is this" -- a question
-- `kind` already answers, since every Wednesday carries one and every sprint
-- Monday carries none. Two fields, one fact, and a guaranteed divergence the
-- first time somebody edits one of them.
--
-- No recurrence. The Wednesday slot is a standing fixture, but its CONTENT
-- varies with the sprint and its room barely varies at all, so a recurrence
-- model would buy ten fewer copy-pastes a semester at the cost of an
-- exceptions table maintained forever.
--
-- No `host`. External events -- the UGA Involvement Fair the club tables at --
-- are out of scope by decision; they live on the Involvement Network.

-- ============================================================
-- Cancellation
-- ============================================================
--
-- A meeting that is called off is not a meeting that never existed, and until
-- now the schema had only the second idea. `deletedAt` is a soft archive for a
-- row authored in error, and every loader filters it out -- so an officer
-- cancelling next Wednesday made it VANISH from the page. A member who had it
-- in their calendar saw nothing and walked to the building anyway.
--
-- These two columns are the difference between "this was never real" and
-- "this was real and is not happening", which are the same fact only to a
-- database. The page has to say the second one out loud.
--
-- Nullable, like every other officer-authored field on this table, and
-- deliberately left out of the sync's completeness check for the same reason
-- `summary`, `kind` and `rsvpUrl` are: officers fill Airtable one keystroke at
-- a time, and a pass landing between two of them must not complain.
alter table "platform"."meetings"
  add column "cancelledAt"        timestamptz,
  add column "cancellationReason" text;

comment on column "platform"."meetings"."cancelledAt" is
  'When this meeting was called off. Null is the ordinary case. Distinct from "deletedAt", which archives a row authored in error: a cancelled meeting is still shown -- struck through, with its reason -- on every surface that is a SCHEDULE, and hidden only from the surfaces that answer "where should I go now".';

comment on column "platform"."meetings"."cancellationReason" is
  'Why, in a few words -- "no sprint this week", "campus closed". Null even when "cancelledAt" is set, because the fact and the explanation arrive in separate keystrokes and the page can state the fact without it.';

-- Capped for the same reason `meetings_summary_length` is, and at a shorter
-- length because this renders inline beside a struck-through row rather than
-- in a paragraph of its own. The parser refuses a longer value rather than
-- truncating it -- half a sentence published under an officer's name, with no
-- signal anywhere, is worse than a message in the cell they typed it into.
alter table "platform"."meetings"
  add constraint "meetings_cancellationReason_length"
  check (
    "cancellationReason" is null
    or char_length("cancellationReason") <= 160
  );

-- The explanation cannot outlive the fact. A reason with no cancellation is a
-- row nothing renders and nobody can find to correct -- unlike the reverse,
-- which is the normal half-filled state of any officer-authored pair and is
-- explicitly allowed.
alter table "platform"."meetings"
  add constraint "meetings_cancellationReason_needs_cancellation"
  check (
    "cancellationReason" is null
    or "cancelledAt" is not null
  );

-- ============================================================
-- The name becomes an override
-- ============================================================
--
-- Every Monday's name has been an officer hand-composing, in prose, a sentence
-- the schema already knew every part of: "Feature Judging, Workshop (Parallel:
-- Next.js and Flutter) and Sprint Kickoff". Three clauses, retyped weekly, and
-- wrong the first week somebody forgets to update one. With `workshops.title`
-- arriving below, "Supabase" would appear in the meeting name AND in the
-- workshop row beneath it, from two sources nothing keeps in sync.
--
-- So the heading is derived and this column stops being required. What is left
-- is the case the derivation cannot serve: a night with its own name worth
-- reading -- "Cold Start", "Midterm Study Session". The rename is the point.
-- `name` invited a name every week; `nameOverride` says what it is for, and
-- the Airtable field is relabelled to say it louder.
--
-- ## The slug moved because of this
--
-- `uniqueSlug` in `server/airtable/sync.ts` derived the permanent URL from the
-- name, so a nullable name would leave new meetings with nothing to slug. The
-- slug is now derived from the meeting's DATE -- and specifically from the
-- date in `EVENT_TZ`, never from `toISOString()`, because the UTC date rolls
-- at 20:00 Eastern and a 20:00 social would otherwise be filed a day late.
--
-- Deriving it from the rendered heading was considered and rejected: that
-- string moves when a workshop is added, and a slug is a URL.
alter table "platform"."meetings"
  rename column "name" to "nameOverride";

alter table "platform"."meetings"
  alter column "nameOverride" drop not null;

comment on column "platform"."meetings"."nameOverride" is
  'A name for this night, when it has one worth reading -- "Cold Start", "Midterm Study Session". Null is the ORDINARY case: a sprint Monday derives its heading from its workshops and judging, and rendering a hand-written restatement of that beside it would be the same information twice from two sources. Authored in Airtable as "Custom name -- irregular events only".';

-- Same cap and same reasoning as the summary: this is laid out as a single
-- line in a schedule row and in a dialog title, and a name that outgrows it is
-- discovered by a member looking at a broken page rather than by the officer
-- who wrote it.
alter table "platform"."meetings"
  add constraint "meetings_nameOverride_length"
  check (
    "nameOverride" is null
    or char_length("nameOverride") <= 80
  );

-- ============================================================
-- Workshops get an identity
-- ============================================================
--
-- A workshop has been three columns -- an id and two foreign keys -- so the
-- only thing a surface could print was the PROJECT's name. That is not what
-- officers call these sessions. The published schedule says "Workshop
-- (Supabase)" and "Workshop (Parallel: Next.js and Flutter)"; the page would
-- have said "Platform" and "Study Group Finder". Different words for the same
-- night, in the two places a member reads it.
--
-- Worse, one of them could not be stored at all. "Workshop (Career Fair
-- Readiness)" has no project and never will -- inventing one would put it on
-- the Projects page as a body of work the club does not have.
--
-- `title` is therefore what the page prints, falling back to the project's
-- name when null so nothing that exists today changes. `projectId` becomes
-- nullable so a workshop can be about a skill rather than a codebase.
--
-- ## The nullable projectId has a cost paid elsewhere
--
-- Every existing read of a workshop INNER JOINS `projects`, so a project-less
-- workshop would silently vanish from every surface rather than render. Those
-- joins -- in `server/loaders/meetings.ts`, `server/loaders/teams.ts` and
-- `server/loaders/stars.ts` -- have to become left joins in the same change. A
-- column whose only row disappears is worse than no column: it fails silently,
-- and it fails on exactly the night the feature was added for.
--
-- The `memberStars` view needs no change and is worth saying so explicitly,
-- because it looks like it should. It joins `workshops` and carries
-- `w."projectId"` through as a grouped column rather than joining `projects`,
-- so a null flows through it correctly and only the LOADER that reads the view
-- (`server/loaders/stars.ts`, which inner-joins `projects` on the view's
-- `projectId`) needs widening.
alter table "platform"."workshops"
  add column "title"       text,
  add column "description" text;

alter table "platform"."workshops"
  alter column "projectId" drop not null;

comment on column "platform"."workshops"."title" is
  'What this workshop is called, in the officers'' own vocabulary -- "Supabase", "Next.js", "Career Fair Readiness". Null falls back to the project''s display name, so every workshop authored before this column keeps rendering exactly as it did.';

comment on column "platform"."workshops"."description" is
  'One or two sentences on what this workshop teaches, shown in the meeting''s detail dialog. Null renders nothing. Workshops are self-contained and assume no prior work, which is the single most useful thing a prospective member can learn here -- so this is worth writing even when the title is self-explanatory.';

comment on column "platform"."workshops"."projectId" is
  'The long-running body of work this workshop teaches against, or null when it teaches a skill rather than a codebase -- a career-readiness session belongs to no project and must not invent one. Every read of this table left-joins "projects" for that reason.';

alter table "platform"."workshops"
  add constraint "workshops_title_length"
  check ("title" is null or char_length("title") <= 80);

alter table "platform"."workshops"
  add constraint "workshops_description_length"
  check ("description" is null or char_length("description") <= 280);

-- ============================================================
-- The kinds a night can be
-- ============================================================
--
-- `20260808000001` set this list at four values and said the list was expected
-- to move as the club worked out what it needed to name. It has moved.
--
-- OUT: `Open lab`, which was a near-synonym of the build session arriving
-- below -- two names for one night, one authored and one derived, differently
-- coloured. And `Career`, which described the wrong noun: a career-readiness
-- session is a WORKSHOP with a title, not a kind of evening, and now that
-- `workshops.title` exists it has somewhere better to live.
--
-- MERGED: `Info session` into `Interest Meeting`. They were the same night
-- under two names, and the club calls it the second one.
--
-- IN: `Build Session`, the Wednesday during a sprint -- roughly half the
-- calendar, and until now indistinguishable from an empty evening. And
-- `Study Session`, the Wednesday when no sprint is running.
--
-- Still spelled as a list rather than an enum, for the reason the original
-- gives: this list is expected to keep moving, and an enum makes each move a
-- migration with a transaction caveat instead of one line in a check.
--
-- Still Title Case display strings rather than identifiers, and that is
-- load-bearing rather than cosmetic. The stored value is what officers pick
-- from the Airtable dropdown AND what the chip prints verbatim, which is
-- exactly what lets a value this repository has never heard of render as
-- itself instead of blanking or crashing. camelCase identifiers would show
-- officers `interestMeeting` in a dropdown and leave an unknown value with no
-- label to fall back to.
--
-- ## Order of operations, on a live deployment
--
-- The rule from `20260808000001` still governs and is worth restating because
-- this migration is the first one to REMOVE choices: a constraint here must
-- never be stricter than its parser. A value the parser accepts and this
-- rejects is not a refused field, it is a constraint violation inside the pull
-- that takes down the entire sync pass, for every table, until somebody edits
-- the offending cell.
--
-- Removing choices makes that a sequencing problem rather than a coding one.
-- The Airtable single-select still offers `Open lab` and `Career` until
-- somebody edits the base by hand -- the scaffolder is create-only and will
-- not narrow an existing select -- so on a live deployment the base must be
-- edited BEFORE this migration runs, not after. On an empty database, which is
-- the case at the time of writing, the ordering is moot.
alter table "platform"."meetings"
  drop constraint "meetings_kind_choices";

alter table "platform"."meetings"
  add constraint "meetings_kind_choices"
  check (
    "kind" is null
    or "kind" in ('Build Session', 'Study Session', 'Interest Meeting', 'Social')
  );

comment on column "platform"."meetings"."kind" is
  'Override naming a meeting whose structure cannot describe it: Build Session, Study Session, Interest Meeting, or Social. Null is the NORMAL case and means "read the derived segments", not "unknown" -- a sprint Monday is fully described by its workshops and its judging, so most rows leave this blank. Not a label for every night.';
