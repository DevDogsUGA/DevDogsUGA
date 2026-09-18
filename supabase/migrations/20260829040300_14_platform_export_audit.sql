-- General append-only audit ledger plus the existing export audit domain table.
--
-- The table is server-only, and the mechanism is worth spelling out because it
-- is easy to half-delete. RLS is enabled and there is NO permissive policy, so
-- no client role can read a row: that absence is the whole deny for SELECT.
-- The three restrictive no_client_* policies below close the write side, which
-- the default privileges in the first migration opened. Both halves are
-- load-bearing. Add a permissive select policy and the ledger becomes public;
-- drop the restrictive trio and anon can insert forged rows.

create type "platform"."auditEventSource" as enum (
  'platform',
  'qr',
  'manual_code',
  'airtable_form',
  'system'
);

create table "platform"."auditEvents" (
  "id"                       uuid not null default gen_random_uuid(),
  "createdAt"                timestamptz not null default now(),
  "actorType"                text not null,
  -- No FK: an audit event outlives the actor account.
  "actorUserId"              uuid,
  "actorAirtableUserId"      text,
  "actorAirtableDisplayName" text,
  "source"                   "platform"."auditEventSource" not null,
  "action"                   text not null,
  "targetType"               text not null,
  "targetId"                 text not null,
  "correlationId"            text,
  "metadata"                 jsonb not null default '{}'::jsonb,
  "beforeReflectionRevisionId" uuid,
  "afterReflectionRevisionId"  uuid,

  constraint "auditEvents_pkey" primary key ("id"),
  constraint "auditEvents_actorType_choices"
    check ("actorType" in ('user', 'airtable_collaborator', 'system')),
  constraint "auditEvents_actor_shape" check (
    ("actorType" = 'user' and "actorUserId" is not null and "actorAirtableUserId" is null)
    or
    ("actorType" = 'airtable_collaborator' and "actorUserId" is null and "actorAirtableUserId" is not null)
    or
    ("actorType" = 'system' and "actorUserId" is null and "actorAirtableUserId" is null)
  ),
  constraint "auditEvents_metadata_bounded"
    check (pg_column_size("metadata") <= 16384),
  constraint "auditEvents_action_length" check (char_length("action") <= 120),
  constraint "auditEvents_targetType_length" check (char_length("targetType") <= 80),
  constraint "auditEvents_targetId_length" check (char_length("targetId") <= 255),
  constraint "auditEvents_beforeReflectionRevisionId_fkey"
    foreign key ("beforeReflectionRevisionId")
    references "platform"."reflectionRevisions"("id") on delete restrict,
  constraint "auditEvents_afterReflectionRevisionId_fkey"
    foreign key ("afterReflectionRevisionId")
    references "platform"."reflectionRevisions"("id") on delete restrict
);

alter table "platform"."auditEvents" enable row level security;

create index "auditEvents_createdAt_idx"
  on "platform"."auditEvents" ("createdAt" desc, "id" desc);
create index "auditEvents_target_idx"
  on "platform"."auditEvents" ("targetType", "targetId", "createdAt" desc);
create unique index "auditEvents_correlation_idempotency_key"
  on "platform"."auditEvents"
    ("source", "correlationId", "action", "targetType", "targetId")
  where "correlationId" is not null;

create policy "auditor_select" on "platform"."auditEvents"
  as permissive for select to authenticated
  using ("platform".has_permission((select auth.uid()), 'canViewAuditLog'));
create policy "no_client_insert" on "platform"."auditEvents"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."auditEvents"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."auditEvents"
  as restrictive for delete to anon, authenticated using (false);

create or replace function "platform".reject_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only' using errcode = '55000';
end;
$$;

create trigger "auditEvents_append_only"
  before update or delete on "platform"."auditEvents"
  for each row execute function "platform".reject_audit_event_mutation();

alter table "platform"."airtableChangeReceipts"
  add constraint "airtableChangeReceipts_auditEventId_fkey"
  foreign key ("auditEventId") references "platform"."auditEvents"("id")
  on delete restrict;

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

-- Keep the established export insertion path working while making the general
-- ledger the chronological source consumed by the Audit Log.
create or replace function "platform".audit_export_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into "platform"."auditEvents" (
    "actorType",
    "actorUserId",
    "source",
    "action",
    "targetType",
    "targetId",
    "metadata"
  ) values (
    case when new."userId" is null then 'system' else 'user' end,
    new."userId",
    'platform',
    'export.created',
    'export',
    new."id"::text,
    jsonb_build_object(
      'kind', new."kind",
      'filters', new."filters",
      'rowCount', new."rowCount"
    )
  );
  return new;
end;
$$;

create trigger "exportAudit_append_general_event"
  after insert on "platform"."exportAudit"
  for each row execute function "platform".audit_export_insert();
