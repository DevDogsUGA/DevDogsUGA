-- Airtable identity, soft deletion, and the sync's own bookkeeping.

-- ============================================================
-- Record identity
-- ============================================================
--
-- The single most important detail in the integration. Airtable record IDs are
-- stable across renames, field edits, view re-sorts and moves between views,
-- so an officer retitling "Sprint 2" to "Fall Sprint 2" updates a row instead
-- of orphaning every attendance record pointing at it.
--
-- Matching on name or slug instead would break the first time somebody fixed
-- a typo, and it would break in the worst way -- by creating a second row that
-- looks right, while the credit already earned stays attached to the first.
alter table "platform"."meetings"     add column "airtableRecordId" text;
alter table "platform"."workshops"    add column "airtableRecordId" text;
alter table "platform"."competitions" add column "airtableRecordId" text;

alter table "platform"."meetings"
  add constraint "meetings_airtableRecordId_key" unique ("airtableRecordId");
alter table "platform"."workshops"
  add constraint "workshops_airtableRecordId_key" unique ("airtableRecordId");
alter table "platform"."competitions"
  add constraint "competitions_airtableRecordId_key" unique ("airtableRecordId");

-- ============================================================
-- Soft deletion
-- ============================================================
--
-- Deleting a row in Airtable archives it here; it is never a hard delete.
-- A meeting that has attendance rows is a record of who was in a room on a
-- Tuesday, and no amount of "I deleted the wrong row" in a spreadsheet should
-- be able to erase that. The row stops appearing on the site and the
-- attendance survives.
alter table "platform"."meetings"     add column "deletedAt" timestamptz;
alter table "platform"."workshops"    add column "deletedAt" timestamptz;
alter table "platform"."competitions" add column "deletedAt" timestamptz;

-- Every public read filters on this, and the archived rows are a rounding
-- error against the live ones.
create index "meetings_live_idx"     on "platform"."meetings" ("startsAt")
  where "deletedAt" is null;
create index "workshops_live_idx"    on "platform"."workshops" ("meetingId")
  where "deletedAt" is null;
create index "competitions_live_idx" on "platform"."competitions" ("workshopId")
  where "deletedAt" is null;

-- ============================================================
-- Sync state
-- ============================================================
--
-- A singleton, the same shape and for the same reason as platform."instance":
-- there is one Airtable base and one sync, so a table with a forced single row
-- is more honest than a key/value store that implies several.
create table "platform"."airtableSyncState" (
  "id"            boolean not null default true,
  "lastSyncedAt"  timestamptz,
  -- Outcome of the most recent pass, so the officer console can show "last run
  -- 3 minutes ago, 2 rows refused" without keeping a log.
  "lastStatus"    text,
  "lastError"     text,
  "rowsUpserted"  integer not null default 0,
  "rowsRefused"   integer not null default 0,
  "rowsArchived"  integer not null default 0,
  constraint "airtableSyncState_pkey" primary key ("id"),
  constraint "airtableSyncState_singleton" check ("id")
);

alter table "platform"."airtableSyncState" enable row level security;

insert into "platform"."airtableSyncState" ("id") values (true);

-- Officers read this through the console, which goes through a server action
-- holding `canTriggerSync`. Nothing about the sync's internals is public, and
-- "lastError" can quote an Airtable payload, so no client policy is permissive
-- here at all -- the table is server-only by having no permissive policy.
create policy "no_client_insert" on "platform"."airtableSyncState"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."airtableSyncState"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."airtableSyncState"
  as restrictive for delete to anon, authenticated using (false);
