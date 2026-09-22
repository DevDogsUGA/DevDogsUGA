-- The Airtable sync's own bookkeeping: one singleton row holding the last
-- pass's outcome, the lease that keeps two passes from overlapping, and the
-- manual-trigger rate limit.
--
-- The one thing to know: this table is server-only, and what makes it so is
-- that RLS is ON and NOTHING here grants a permissive policy. The three
-- restrictive no_client_* policies below deny nothing on their own; a
-- restrictive policy only narrows what a permissive one already allowed. Drop
-- the `enable row level security` line and the table becomes world-readable
-- through PostgREST. Drop the restrictive trio and the table stays closed but
-- loses its stated intent. Keep both halves.

-- ============================================================
-- Sync state
-- ============================================================
--
-- A singleton, the same shape and for the same reason as platform."instance":
-- there is one Airtable base and one sync, so a table with a forced single row
-- is more honest than a key/value store that implies several.
--
-- Every column below arrives at once. The lease, rate-limit and refusal
-- columns were bolted on a day later in the original history; there is no
-- reason for a reader to meet them separately.
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

  -- The lease. See the note below on why this is a row and not an advisory
  -- lock.
  "runStartedAt"  timestamptz,
  "runExpiresAt"  timestamptz,

  -- The manual-trigger rate limit is one global window, not one per caller.
  -- See the note below.
  "lastManualRunAt" timestamptz,

  -- Display only. The console shows who kicked off the last manual pass. Not
  -- part of the limit. `set null` rather than cascade: a departed officer's
  -- deleted account should not take the sync's bookkeeping row with it.
  "lastManualRunBy" uuid
    references auth."users" ("id") on delete set null on update cascade,

  -- The detail behind "rowsRefused", so the console can say which rows and
  -- why. Each record's `Sync status` field in Airtable gets the same text,
  -- which is where an officer actually sees it, but a field in Airtable is not
  -- something the console can read cheaply.
  "lastRefusals"  jsonb,

  constraint "airtableSyncState_pkey" primary key ("id"),
  constraint "airtableSyncState_singleton" check ("id"),
  -- Both null or both set: a claimed lease always knows when it expires. A row
  -- with a start and no expiry would be a lock nothing could ever break.
  constraint "airtableSyncState_run_window"
    check (("runStartedAt" is null) = ("runExpiresAt" is null))
);

-- ============================================================
-- Why the lease is a row and not an advisory lock
-- ============================================================
--
-- The design called for `pg_try_advisory_lock` held for the duration of a
-- pass. That does not survive contact with how these apps actually connect.
--
-- Advisory locks come in two scopes and neither one works here:
--
--   * SESSION scope (`pg_try_advisory_lock`) binds the lock to a backend
--     connection. The apps connect through Supabase's transaction-mode
--     pooler, which hands a different backend to each transaction, so the
--     `pg_advisory_unlock` at the end of the pass can land on a different
--     backend than the lock did. The unlock silently returns false and the
--     lock leaks for the life of that backend, which is to say the sync stops
--     running until something recycles the pool.
--
--   * TRANSACTION scope (`pg_try_advisory_xact_lock`) is released correctly,
--     but only by ending the transaction, which would mean holding one open
--     across every Airtable HTTP call in the pass. An idle-in-transaction
--     connection for the length of a sync is exactly the thing that exhausts
--     a pooler.
--
-- A lease row has neither problem. It is ordinary MVCC, so it does not care
-- which backend serves which statement, and its correctness comes from an
-- expiry rather than from a connection staying alive. That expiry also fixes
-- the failure mode an advisory lock genuinely handles better: a worker killed
-- mid-pass. A session lock dies with its backend; a lease has to be allowed to
-- go stale, which is what "runExpiresAt" is for.

-- ============================================================
-- Why the rate limit is global
-- ============================================================
--
-- "lastManualRunAt" is one timestamp for the whole club, not one per officer,
-- and that is a departure from the design's wording.
--
-- What the limit protects is the Airtable call allowance, and that allowance
-- is per workspace, a shared resource. Rate-limiting a shared budget per
-- caller has the wrong shape: five officers each entitled to a run a minute
-- is five times the load, justified by a rule that reads as if it prevented
-- load. And a per-caller window cannot be stored in a singleton anyway
-- without remembering only the most recent caller, which would let two
-- officers alternating clicks defeat it entirely.
--
-- One run a minute, whoever asks. The button is the kind of thing that gets
-- clicked four times when it appears not to work.

alter table "platform"."airtableSyncState" enable row level security;

-- The singleton row. The sync only ever UPDATEs it, and nothing in
-- application code inserts it. Without this line the table stays empty and
-- every pass silently writes nothing.
insert into "platform"."airtableSyncState" ("id") values (true);

-- Officers read this through the console, which goes through a server action
-- holding `canTriggerSync`. Nothing about the sync's internals is public, and
-- "lastError" can quote an Airtable payload, so no client policy is permissive
-- here at all. The table is server-only by having no permissive policy;
-- service_role reaches it by bypassing RLS entirely.
--
-- Split per command rather than written as one `for all using (false)`,
-- because the `for all` form would also apply to SELECT and is harder to read
-- back. These three names repeat verbatim on platform."attendance" and
-- platform."exportAudit"; policy names are per table, so that is legal and
-- deliberate. Do not "deduplicate" them.
create policy "no_client_insert" on "platform"."airtableSyncState"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."airtableSyncState"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."airtableSyncState"
  as restrictive for delete to anon, authenticated using (false);
