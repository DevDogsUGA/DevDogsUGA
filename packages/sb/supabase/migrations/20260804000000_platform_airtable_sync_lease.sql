-- The sync's mutual exclusion and its manual-trigger rate limit.
--
-- ============================================================
-- Why this is a lease row and not an advisory lock
-- ============================================================
--
-- The design called for `pg_try_advisory_lock` held for the duration of a
-- pass. That does not survive contact with how these apps actually connect.
--
-- Advisory locks come in two scopes and neither one works here:
--
--   * SESSION scope (`pg_try_advisory_lock`) binds the lock to a backend
--     connection. The apps connect through Supabase's transaction-mode
--     pooler, which hands a different backend to each transaction -- so the
--     `pg_advisory_unlock` at the end of the pass can land on a different
--     backend than the lock did. The unlock silently returns false and the
--     lock leaks for the life of that backend, which is to say the sync stops
--     running until something recycles the pool.
--
--   * TRANSACTION scope (`pg_try_advisory_xact_lock`) is released correctly,
--     but only by ending the transaction -- which would mean holding one open
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
alter table "platform"."airtableSyncState"
  add column "runStartedAt" timestamptz,
  add column "runExpiresAt" timestamptz;

-- Both null or both set: a claimed lease always knows when it expires. A row
-- with a start and no expiry would be a lock nothing could ever break.
alter table "platform"."airtableSyncState"
  add constraint "airtableSyncState_run_window"
  check (("runStartedAt" is null) = ("runExpiresAt" is null));

-- ============================================================
-- The manual-trigger rate limit
-- ============================================================
--
-- Deliberately GLOBAL rather than per caller, which is a departure from the
-- design's wording.
--
-- What the limit protects is the Airtable call allowance, and that allowance
-- is per workspace -- a shared resource. Rate-limiting a shared budget per
-- caller has the wrong shape: five officers each entitled to a run a minute
-- is five times the load, justified by a rule that reads as if it prevented
-- load. And a per-caller window cannot be stored in a singleton anyway
-- without remembering only the most recent caller, which would let two
-- officers alternating clicks defeat it entirely.
--
-- One run a minute, whoever asks. The button is the kind of thing that gets
-- clicked four times when it appears not to work.
alter table "platform"."airtableSyncState"
  add column "lastManualRunAt" timestamptz;

-- Display only -- the console shows who kicked off the last manual pass. Not
-- part of the limit. `set null` rather than cascade: a departed officer's
-- deleted account should not take the sync's bookkeeping row with it.
alter table "platform"."airtableSyncState"
  add column "lastManualRunBy" uuid
  references auth."users" ("id") on delete set null on update cascade;

-- ============================================================
-- Refusal bookkeeping
-- ============================================================
--
-- The count already exists as "rowsRefused". This is the detail behind it, so
-- the officer console can say which rows and why without the officer having
-- to go find them in Airtable. Written back to each record's `Sync status`
-- field as well -- that is where an officer actually sees it -- but a field
-- in Airtable is not something the console can read cheaply.
alter table "platform"."airtableSyncState"
  add column "lastRefusals" jsonb;
