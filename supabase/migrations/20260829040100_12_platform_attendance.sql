-- Attendance, EL reflections, and their immutable revisions.
--
-- Postgres owns every row in this file and is the only source of truth.
-- Clients may read only their own evidence; every write travels through a
-- server-side command.

create type "platform"."checkInMethod" as enum ('qr', 'manual_code');

-- ============================================================
-- Attendance
-- ============================================================

-- No officer overrides or corrections: check-in is the only writer, and the
-- table has no revocation, no manual add, and nothing an officer records on a
-- member's behalf. A late check-in is handled by re-displaying the rotating
-- code, not by a correction command, so there is nothing here for anyone but
-- the member themselves to write.
create table "platform"."attendance" (
  "id"               uuid not null default gen_random_uuid(),
  "meetingId"        uuid not null,
  "userId"           uuid not null,
  "method"           "platform"."checkInMethod" not null,
  "recordedAt"       timestamptz not null default now(),

  constraint "attendance_pkey" primary key ("id"),
  constraint "attendance_meetingId_userId_key" unique ("meetingId", "userId"),
  constraint "attendance_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete restrict,
  constraint "attendance_userId_fkey" foreign key ("userId")
    references auth."users"("id") on update cascade on delete cascade
);

alter table "platform"."attendance" enable row level security;

create index "attendance_userId_idx"
  on "platform"."attendance" ("userId", "recordedAt" desc);
create index "attendance_meetingId_idx"
  on "platform"."attendance" ("meetingId");

create policy "own_select" on "platform"."attendance"
  as permissive for select to authenticated
  using ((select auth.uid()) = "userId");
create policy "no_client_insert" on "platform"."attendance"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."attendance"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."attendance"
  as restrictive for delete to anon, authenticated using (false);

-- ============================================================
-- Reflections
-- ============================================================

create table "platform"."reflections" (
  "id"            uuid not null default gen_random_uuid(),
  "userId"        uuid not null,
  "meetingId"     uuid,
  "competitionId" uuid,
  "content"       text not null default '',
  -- Null is a draft. A timestamp is retained because submission is an explicit
  -- member action, not something inferred from the deadline passing.
  "submittedAt"   timestamptz,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now(),

  constraint "reflections_pkey" primary key ("id"),
  constraint "reflections_exactly_one_activity" check (
    (("meetingId" is not null)::int + ("competitionId" is not null)::int) = 1
  ),
  constraint "reflections_userId_fkey" foreign key ("userId")
    references auth."users"("id") on update cascade on delete cascade,
  constraint "reflections_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete restrict,
  constraint "reflections_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on update cascade on delete restrict
);

alter table "platform"."reflections" enable row level security;

create unique index "reflections_userId_meetingId_key"
  on "platform"."reflections" ("userId", "meetingId")
  where "meetingId" is not null;
create unique index "reflections_userId_competitionId_key"
  on "platform"."reflections" ("userId", "competitionId")
  where "competitionId" is not null;
create index "reflections_userId_updatedAt_idx"
  on "platform"."reflections" ("userId", "updatedAt" desc);

create policy "own_select" on "platform"."reflections"
  as permissive for select to authenticated
  using ((select auth.uid()) = "userId");
create policy "no_client_insert" on "platform"."reflections"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."reflections"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."reflections"
  as restrictive for delete to anon, authenticated using (false);

-- A revision snapshots every mutable field, not only the body, so submission
-- state and content changes are equally reconstructable without putting full
-- reflection text in the audit ledger. There is no officer-editable path
-- here — `createdByUserId` is always the member who saved or submitted.
create table "platform"."reflectionRevisions" (
  "id"                      uuid not null default gen_random_uuid(),
  "reflectionId"            uuid not null,
  "userId"                  uuid not null,
  "meetingId"               uuid,
  "competitionId"           uuid,
  "content"                 text not null,
  "submittedAt"             timestamptz,
  "createdAt"               timestamptz not null default now(),
  "createdByUserId"         uuid not null,
  "changeReason"            text,

  constraint "reflectionRevisions_pkey" primary key ("id"),
  constraint "reflectionRevisions_reflectionId_fkey" foreign key ("reflectionId")
    references "platform"."reflections"("id") on update cascade on delete cascade,
  constraint "reflectionRevisions_exactly_one_activity" check (
    (("meetingId" is not null)::int + ("competitionId" is not null)::int) = 1
  ),
  constraint "reflectionRevisions_changeReason_length"
    check ("changeReason" is null or char_length("changeReason") <= 500)
);

alter table "platform"."reflectionRevisions" enable row level security;

create index "reflectionRevisions_reflectionId_createdAt_idx"
  on "platform"."reflectionRevisions" ("reflectionId", "createdAt" desc);
create index "reflectionRevisions_userId_createdAt_idx"
  on "platform"."reflectionRevisions" ("userId", "createdAt" desc);

create policy "own_or_auditor_select" on "platform"."reflectionRevisions"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "userId"
    or "platform".has_permission((select auth.uid()), 'canViewAuditLog')
  );
create policy "no_client_insert" on "platform"."reflectionRevisions"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."reflectionRevisions"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."reflectionRevisions"
  as restrictive for delete to anon, authenticated using (false);

-- Defense in depth for the owning application role: revisions are append-only
-- even when a future server path accidentally attempts an update or delete.
create or replace function "platform".reject_reflection_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'reflection revisions are append-only' using errcode = '55000';
end;
$$;

create trigger "reflectionRevisions_append_only"
  before update or delete on "platform"."reflectionRevisions"
  for each row execute function "platform".reject_reflection_revision_mutation();

-- ============================================================
-- Global EL reflection policy
-- ============================================================

create table "platform"."reflectionSettings" (
  "id"                   boolean not null default true,
  "minimumWordCount"     integer not null default 100,
  "submissionWindowDays" integer not null default 7,
  "updatedAt"            timestamptz not null default now(),
  constraint "reflectionSettings_pkey" primary key ("id"),
  constraint "reflectionSettings_singleton" check ("id"),
  constraint "reflectionSettings_minimumWordCount_positive"
    check ("minimumWordCount" > 0),
  constraint "reflectionSettings_submissionWindowDays_positive"
    check ("submissionWindowDays" > 0)
);

alter table "platform"."reflectionSettings" enable row level security;
insert into "platform"."reflectionSettings" ("id") values (true);

create policy "no_client_insert" on "platform"."reflectionSettings"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."reflectionSettings"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."reflectionSettings"
  as restrictive for delete to anon, authenticated using (false);
