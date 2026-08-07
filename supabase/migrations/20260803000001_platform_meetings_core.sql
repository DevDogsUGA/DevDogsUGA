-- Meetings, projects, workshops and competitions.
--
-- The shape here is the result of one correction that is worth stating up
-- front, because the obvious model is wrong and reads as more natural.
--
-- A competition is NOT an event. A feature is announced after a workshop,
-- teams get nearly a full week to implement it, and judging happens
-- immediately before the NEXT workshop. So a competition is a week-long
-- asynchronous window bracketed by two in-person moments that belong to
-- DIFFERENT meetings, and a meeting straddles two competitions -- the judging
-- of the one that is ending and the announcement of the one beginning.
--
-- An earlier draft modelled all of this as a single `sessions` table with an
-- `(event, track, stage)` discriminator. That mixed things you ATTEND with
-- things that merely have a DURATION, which is why it could not answer
-- "was this member present?" without also deciding what "present" means for a
-- week-long window. Splitting the two removed the discriminator entirely.
--
--   meetings ──< workshops (one per project, running in parallel)
--                    │
--                    └──< competitions (one per workshop, week-long)
--
-- There is deliberately no `eventStage` enum. It existed only to say which
-- half of a conflated table a row belonged to, and the split is what makes it
-- unnecessary -- the clearest sign the split was right.

create type "platform"."teamRole" as enum ('lead', 'member');
create type "platform"."submissionState" as enum ('open', 'closed', 'merged');
create type "platform"."checkInMethod" as enum ('code', 'discord', 'officer');
create type "platform"."membershipDirection" as enum ('invite', 'request');
create type "platform"."membershipRequestStatus" as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

-- ============================================================
-- Projects
-- ============================================================
--
-- A project is a long-running body of work that workshops teach against --
-- "the platform", "the schedule builder". Its own table rather than a text
-- column on the workshop, because the same project runs across many meetings
-- and the name has to stay editable in one place.
--
-- `appId` is nullable and that is the point: a project is not an app. A
-- project can exist before anything is deployed, and several projects can
-- target one app. The reference is for the surfaces that want to link a
-- workshop to the thing it ships, not an identity claim.
create table "platform"."projects" (
  "id"          uuid not null default gen_random_uuid(),
  "slug"        text not null,
  "displayName" text not null,
  "appId"       uuid,
  "sortOrder"   double precision not null default 0,
  constraint "projects_pkey" primary key ("id"),
  constraint "projects_slug_key" unique ("slug"),
  constraint "projects_appId_fkey" foreign key ("appId")
    references "platform"."apps"("id") on update cascade on delete set null
);

alter table "platform"."projects" enable row level security;

-- ============================================================
-- Meetings
-- ============================================================
--
-- The in-person moment. This is the only one of the four that a member can be
-- PRESENT at, which is why attendance keys to it rather than to a workshop.
create table "platform"."meetings" (
  "id"              uuid not null default gen_random_uuid(),
  "slug"            text not null,
  "name"            text not null,
  "location"        text,
  "startsAt"        timestamptz not null,
  "endsAt"          timestamptz not null,
  -- Check-in closes on its own clock rather than at "endsAt": arriving late is
  -- normal and the roster should still be correctable afterwards by an
  -- officer, but self-service check-in has to stop being open at some point or
  -- the code circulates and the roster stops meaning anything.
  "checkInClosesAt" timestamptz not null,
  constraint "meetings_pkey" primary key ("id"),
  constraint "meetings_slug_key" unique ("slug"),
  constraint "meetings_endsAt_after_startsAt" check ("endsAt" > "startsAt")
);

alter table "platform"."meetings" enable row level security;

-- ============================================================
-- Workshops
-- ============================================================
--
-- One meeting runs several workshops in parallel, one per project, and a
-- member attends exactly one of them.
create table "platform"."workshops" (
  "id"         uuid not null default gen_random_uuid(),
  "meetingId"  uuid not null,
  "projectId"  uuid not null,
  constraint "workshops_pkey" primary key ("id"),
  constraint "workshops_meetingId_projectId_key" unique ("meetingId", "projectId"),
  -- Denormalized composite key. Postgres can only point a foreign key at a
  -- unique constraint, so this exists purely so `attendance` can declare
  --   foreign key ("workshopId", "meetingId") -> workshops(id, "meetingId")
  -- and have the database reject an attendance row whose workshop belongs to
  -- some other meeting. Without it that invariant is a trigger, or nothing.
  constraint "workshops_id_meetingId_key" unique ("id", "meetingId"),
  constraint "workshops_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete cascade,
  constraint "workshops_projectId_fkey" foreign key ("projectId")
    references "platform"."projects"("id") on update cascade on delete restrict
);

alter table "platform"."workshops" enable row level security;

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
  -- competition. Both are nullable because officers author this in Airtable
  -- and fill the fields one at a time; null means "not yet scheduled", which
  -- is a state the officer surface should surface rather than one the database
  -- should refuse. Deliberately NOT constrained to be set together -- an
  -- earlier draft added `check (("judgingStartsAt" is null) = ("judgingMeetingId" is null))`
  -- and it made the half-filled state unrepresentable, turning normal
  -- data entry into a write error.
  "judgingMeetingId" uuid,
  "judgingStartsAt"  timestamptz,
  -- null falls back to platform."instance"."defaultMaxTeamSize".
  "maxTeamSize"      smallint,
  -- null = not yet graded. Officers fill this in through Airtable once they
  -- have decided what the feature required.
  "requirementCount" smallint,
  constraint "competitions_pkey" primary key ("id"),
  constraint "competitions_slug_key" unique ("slug"),
  constraint "competitions_workshopId_key" unique ("workshopId"),
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
-- Instance configuration
-- ============================================================
--
-- Team size is configuration rather than a constant because it is a club
-- decision that changes between semesters, and a competition can override it
-- for one week without the default moving.
alter table "platform"."instance"
  add column "defaultMaxTeamSize" smallint not null default 4;

alter table "platform"."instance"
  add constraint "instance_defaultMaxTeamSize_positive"
  check ("defaultMaxTeamSize" > 0);

-- ============================================================
-- RLS
-- ============================================================
--
-- The schedule is public information: the marketing site lists meetings and
-- the projects they cover to logged-out visitors, so `anon` reads all four.
--
-- Every write is denied to clients. These tables are authored in Airtable and
-- arrive through the sync, which runs server-side as the owning role and so
-- is not subject to RLS at all. Denying client writes is not belt-and-braces
-- -- one publishable key reaches this schema from any browser, and the deny
-- policies are the only thing standing between that key and the schedule.
--
-- Split per command rather than one `for all ... using (false)`: a restrictive
-- policy written `for all` also applies to SELECT and would silently override
-- the read policy above it.

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
