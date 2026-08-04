-- Attendance: who was in the room.
--
-- Keyed to the MEETING, with the workshop as a dimension rather than the key.
-- A member attends a meeting once no matter how many workshops it holds, so
-- "attended twice" must be unrepresentable -- hence unique ("meetingId",
-- "userId") and a nullable "workshopId" that records which room they were in.
--
-- The design note for this migration also listed the `memberStars` view. It
-- lands in the next one instead: the view's third branch reads
-- platform."teamAwards" to find winners, and that table does not exist yet.
-- Splitting them keeps each migration independently applicable, which is the
-- property the six-file split exists to preserve.
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

  constraint "attendance_pkey" primary key ("id"),
  constraint "attendance_meetingId_userId_key" unique ("meetingId", "userId"),
  -- 'officer' is the only method somebody else can record for you. A 'code' or
  -- 'discord' row with a recorder means the audit trail is lying about how the
  -- member was checked in.
  constraint "attendance_recordedBy_only_for_officer"
    check ("recordedBy" is null or "method" = 'officer'),

  constraint "attendance_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete cascade,
  constraint "attendance_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on update cascade on delete cascade,
  -- The composite target from migration 1. This is what makes "the workshop
  -- must belong to the meeting" a database guarantee rather than a comment:
  -- a row naming Monday's meeting and Thursday's workshop is rejected.
  constraint "attendance_workshopId_meetingId_fkey"
    foreign key ("workshopId", "meetingId")
    references "platform"."workshops"("id", "meetingId")
    on update cascade on delete set null
);

alter table "platform"."attendance" enable row level security;

-- The star grid and the export both read this by member.
create index "attendance_userId_idx" on "platform"."attendance" ("userId");

-- ============================================================
-- RLS
-- ============================================================
--
-- Own rows only, and deliberately narrow: officers read other people's
-- attendance through a server action that checks `canEditAttendance`, so a
-- broad `authenticated` read never has to exist. Making the client policy the
-- permissive one would mean the whole club's attendance is one publishable key
-- away from anybody who opens the network tab.
create policy "own_select" on "platform"."attendance"
  as permissive for select to authenticated
  using ((select auth.uid()) = "userId");

-- Check-in is a server action: it validates the meeting's code against
-- "checkInClosesAt" and picks the method, none of which a client may assert
-- about itself.
create policy "no_client_insert" on "platform"."attendance"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."attendance"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."attendance"
  as restrictive for delete to anon, authenticated using (false);
