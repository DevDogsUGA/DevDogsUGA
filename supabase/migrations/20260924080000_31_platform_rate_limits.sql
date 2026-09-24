-- A generic per-subject rate-limit ledger, backing `server/rateLimit.ts`'s
-- `consumeRateLimit`.
--
-- Why a table and not the Workers Rate Limiting binding that already backs
-- `/attendance/claim` (see `server/attendance/rateLimit.ts`): that binding's
-- `simple` mode only accepts a `period` of 10 or 60 seconds -- it cannot
-- express "20 per hour" or "50 per day", which is what the team actions in
-- `server/actions/teams.ts` need (GitHub calls and invite emails are cheap
-- to burst but expensive to have bulk-abuse, on a timescale the binding has
-- no way to represent). This table is the generalized form: any (scope,
-- subject, limit, window) budget, not just sub-minute ones. The binding stays
-- exactly as it is for attendance's sub-minute burst case, which it is a
-- better fit for (no round trip to Postgres per code guess).
--
-- One row per allowed attempt, not a running counter column: a row per hit
-- is what lets `consumeRateLimit` check-and-record in one atomic statement
-- (INSERT ... SELECT ... WHERE count < limit) without a separate read-then-
-- write race, and what lets different scopes share one table without
-- reserving columns for every future window shape. Same table, same
-- statement shape, whether the budget is "10 per 10 minutes" or "50 per
-- day" -- only the interval and limit bound into the query differ.
--
-- Server-only, the same way `exportAudit` and `auditEvents` are: RLS is
-- enabled with no permissive policy at all, so no client role can read a
-- row, and the three restrictive `no_client_*` policies below close the
-- write side the default privileges in migration 00 opened. Only the
-- application's owning role (which bypasses RLS) ever touches this table.
create table "platform"."rateLimitHits" (
  "id"        uuid not null default gen_random_uuid(),
  -- Identifies which budget this hit counts against, e.g. "team:create",
  -- "team:invite:user", "team:invite:team". Free text rather than an enum:
  -- new call sites add a new scope string, not a migration.
  "scope"     text not null,
  -- The user or team the budget is scoped to, depending on `scope`. No
  -- foreign key: a hit is a historical fact about an attempt, and it must
  -- not vanish (or block a delete) just because the account or team it named
  -- no longer exists.
  "subjectId" uuid not null,
  "createdAt" timestamptz not null default now(),

  constraint "rateLimitHits_pkey" primary key ("id")
);

-- Serves `consumeRateLimit`'s window-count query directly: it always filters
-- on (scope, subjectId) and a `createdAt` lower bound. Descending so the
-- most recent hits -- the ones every window check actually reads -- are the
-- leaf entries scanned first.
create index "rateLimitHits_scope_subject_createdAt_idx"
  on "platform"."rateLimitHits" ("scope", "subjectId", "createdAt" desc);

alter table "platform"."rateLimitHits" enable row level security;

create policy "no_client_insert" on "platform"."rateLimitHits"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."rateLimitHits"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."rateLimitHits"
  as restrictive for delete to anon, authenticated using (false);
