-- Export audit ledger: platform."exportAudit", one row per roster download.
--
-- The table is server-only, and the mechanism is worth spelling out because it
-- is easy to half-delete. RLS is enabled and there is NO permissive policy, so
-- no client role can read a row: that absence is the whole deny for SELECT.
-- The three restrictive no_client_* policies below close the write side, which
-- the default privileges in the first migration opened. Both halves are
-- load-bearing. Add a permissive select policy and the ledger becomes public;
-- drop the restrictive trio and anon can insert forged rows.

-- Who downloaded what.
--
-- `stars.csv` carries member emails, so every download is recorded. This is the
-- protection the design noted was LOST by exporting attendance from Airtable
-- instead of the platform: anybody with base access can export an Airtable view
-- silently, and bulk extraction stops being detectable. Keeping the one export
-- that survived auditable is what stops that loss from spreading to the export
-- that still holds the most PII.
create table "platform"."exportAudit" (
  "id"         uuid primary key default gen_random_uuid(),
  -- `set null` rather than cascade: the point of an audit row is that it
  -- outlives the account. A departed officer's deletion must not erase the
  -- record that they took a copy of the roster.
  "userId"     uuid references auth."users" ("id") on delete set null on update cascade,
  "kind"       text not null,
  -- The filters the download was made with. Two officers exporting different
  -- slices is a different fact from two exporting the whole roster, and only
  -- the parameters distinguish them.
  "filters"    jsonb not null default '{}'::jsonb,
  "rowCount"   integer,
  "createdAt"  timestamptz not null default now()
);

-- The query is always "recent downloads", newest first.
create index "exportAudit_createdAt_idx"
  on "platform"."exportAudit" ("createdAt" desc);

alter table "platform"."exportAudit" enable row level security;

-- Server-only, by having no permissive policy at all. The console reads this
-- through a server action holding `canViewAuditLog`; a member being able to
-- see who exported the roster is a different disclosure from the export
-- itself and is not one this table grants.
--
-- These three names are reused verbatim on platform."attendance" and
-- platform."airtableSyncState". Policy names are per-table, so that is legal,
-- and a pass that deduplicates by name deletes live policies.
create policy "no_client_insert" on "platform"."exportAudit"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."exportAudit"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."exportAudit"
  as restrictive for delete to anon, authenticated using (false);
