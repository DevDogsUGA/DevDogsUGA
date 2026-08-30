-- Attendance: who was in the room.
--
-- One table, the checkInMethod enum it is the only consumer of, and four
-- policies. Keyed to the MEETING, with the workshop as a dimension rather
-- than part of the key: a member attends a meeting once however many
-- workshops it holds, so "attended twice" is unrepresentable. That is what
-- unique ("meetingId", "userId") buys, and "workshopId" stays nullable so it
-- can record which room they sat in without ever being required.
--
-- The one thing to know before editing: the only permissive policy is
-- own_select, and it is narrow on purpose. Officers read other members'
-- attendance through server actions that check canEditAttendance, never
-- through RLS. Widen own_select and the whole club's attendance is one
-- publishable anon key away from anybody who opens the network tab.

-- ============================================================
-- How a row got here
-- ============================================================
--
-- Three capture paths and the enum lists exactly those three. 'airtable' is
-- the form the member submits in the room, mirrored in by the sync;
-- 'officer' is somebody recording attendance on the member's behalf;
-- 'discord' is the bot command the design note describes.
--
-- 'airtable' is its own value rather than a reuse of 'officer' because
-- "recordedBy" may be non-null only for 'officer'. An imported row labelled
-- 'officer' would either name a recorder who never typed it or fail the
-- check. It is also the honest answer to "how do we know they were there":
-- a form the member submitted is a different claim from an officer asserting
-- it.
--
-- The enum sits in this file, not with the events tables, because
-- attendance."method" is the only thing in the schema that uses it.
create type "platform"."checkInMethod" as enum ('discord', 'officer', 'airtable');

-- ============================================================
-- The ledger
-- ============================================================
--
-- Airtable is where an attendance row is CREATED and Postgres is where it is
-- asked about. The mirror has to exist: "memberStars" is a view over this
-- table and team eligibility is decided from it, and neither can depend on a
-- vendor being reachable or on a fifteen-minute sync being current.
create table "platform"."attendance" (
  "id"         uuid not null default gen_random_uuid(),
  "meetingId"  uuid not null,
  -- Nullable: an officer correcting a roster after the fact often knows
  -- somebody was there without knowing which workshop they sat in, and
  -- refusing the row would lose the attendance to preserve a detail.
  "workshopId" uuid,
  "userId"     uuid not null,
  "method"     "platform"."checkInMethod" not null,
  -- Set when an officer records the row on somebody's behalf. No foreign key:
  -- the ledger entry outlives the officer's account.
  "recordedBy" uuid,
  "recordedAt" timestamptz not null default now(),
  -- The Airtable record id, so a re-import updates the row it created rather
  -- than colliding with it. Identity is the record id, never a name or an
  -- email, because ids survive an officer fixing a typo and emails do not.
  -- Nullable, because rows an officer or the bot creates have no Airtable
  -- record behind them and never will.
  "airtableRecordId" text,

  constraint "attendance_pkey" primary key ("id"),
  constraint "attendance_meetingId_userId_key" unique ("meetingId", "userId"),
  -- 'officer' is the only method somebody else can record for you. A row
  -- naming a recorder under any other method is lying about how the member
  -- was counted.
  constraint "attendance_recordedBy_only_for_officer"
    check ("recordedBy" is null or "method" = 'officer'),

  constraint "attendance_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete cascade,
  constraint "attendance_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on update cascade on delete cascade,
  -- The composite target from the events file. This is what makes "the
  -- workshop must belong to the meeting" a database guarantee rather than a
  -- comment: a row naming Monday's meeting and Thursday's workshop is
  -- rejected. It is also why workshops keeps its otherwise redundant
  -- workshops_id_meetingId_key.
  constraint "attendance_workshopId_meetingId_fkey"
    foreign key ("workshopId", "meetingId")
    references "platform"."workshops"("id", "meetingId")
    on update cascade on delete set null
);

alter table "platform"."attendance" enable row level security;

-- The star grid and the export both read this by member.
create index "attendance_userId_idx" on "platform"."attendance" ("userId");

-- Partial, so the many null rows from the officer and bot paths do not all
-- have to be distinct from each other. An index rather than a table
-- constraint: it is what the sync's upsert targets, and it stays droppable
-- and rebuildable on its own.
create unique index "attendance_airtableRecordId_key"
  on "platform"."attendance" ("airtableRecordId")
  where "airtableRecordId" is not null;

comment on column "platform"."attendance"."airtableRecordId" is
  'The Airtable record this row was imported from. Null for rows created by check-in code or by an officer. Unique, so a re-import updates rather than duplicates.';

-- ============================================================
-- RLS
-- ============================================================
--
-- A member reads their own rows and nothing else. Every write path is a
-- server action: it decides the method, resolves the workshop, and checks
-- canEditAttendance, none of which a client may assert about itself.
--
-- Both halves matter. own_select is the only permissive policy, so it is the
-- entire client read surface; the three restrictive policies are what stop a
-- client writing under it. The no_client_* names repeat on other tables in
-- this schema on purpose. Policies are per-table, so that is legal, and
-- deduplicating by name would delete live policies.
create policy "own_select" on "platform"."attendance"
  as permissive for select to authenticated
  using ((select auth.uid()) = "userId");

create policy "no_client_insert" on "platform"."attendance"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."attendance"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."attendance"
  as restrictive for delete to anon, authenticated using (false);
