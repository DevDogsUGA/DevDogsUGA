-- Content types: what an app can have reported, derived from its own schema.
--
-- The table this replaces, "reportContentTypes", was a per-OAuth-client list of
-- labels. It carried no semantics -- nothing could resolve a label to a row, so
-- a report's "contentId" was an opaque string the platform could not check,
-- which is precisely why verifying a report needed a webhook round-trip to the
-- app that owned it.
--
-- On one instance the platform can just look. A table is moderatable when it
-- carries a foreign key to platform."reportResolutions", and that foreign key is
-- the entire registration:
--
--   alter table forum."resources"
--     add column "quarantinedBy" uuid
--       references platform."reportResolutions"(id) on delete set null;
--
-- Nothing is stored on this side, so nothing can drift: drop the column and the
-- table stops being moderatable, with no stale registration left behind to
-- disagree with the schema. That also means there is no registration function,
-- no validation function, and no DDL event trigger to maintain.
--
-- The security rule this used to need -- "an app may only bind tables in its own
-- schema" -- becomes structural rather than enforced, because the foreign key
-- lives in the app's table and an app cannot add a column to a schema it does
-- not own.

-- ============================================================
-- Overrides and declarations
-- ============================================================

-- Defaults closed. Reporting must never become a disclosure oracle for private
-- content just because somebody forgot to configure visibility, so an
-- unconfigured type is 'restricted' and its snapshot is withheld from everyone
-- but a moderator.
create type "platform"."contentVisibility" as enum ('public', 'restricted');

-- One optional row per (app, table). Two jobs:
--
--   * override a derived default -- a nicer label, disambiguating two FKs to
--     auth.users, excluding a sensitive text column from the snapshot, marking
--     content public, adding a click-through URL;
--   * declare a type that is reportable but NOT quarantinable, like the forum's
--     profile, where the remedy is suspending the user rather than hiding a row.
--     Such a table has no foreign key to "reportResolutions", so a row here is
--     the only thing that makes it visible to moderation.
create table "platform"."contentTypes" (
  "id"          uuid not null default gen_random_uuid(),
  "appId"       uuid not null,
  -- The table this describes, in the app's own schema. Also the join key back
  -- to the derived set, which is why it is required even for a pure override.
  "tableName"   text not null,
  -- Defaults to "tableName". Overriding is how forum."resources" is reported as
  -- 'resource' rather than 'resources'; the default is the table name verbatim
  -- because singularising is a lossy guess that cannot be inverted.
  "contentType" text,
  "label"       text,
  -- Needed only when the table has zero or several foreign keys to auth.users.
  "authorColumn" text,
  -- Identifiers only, verified below against pg_attribute and interpolated with
  -- %I when the snapshot is built. A free-text expression here would be an
  -- injection vector authored in a table; expressions belong in a reviewed
  -- "contentResolver" function instead.
  "snapshotColumns" text[],
  -- '{ref}' is replaced with the content reference.
  "urlTemplate" text,
  "visibility"  "platform"."contentVisibility",
  "createdAt"   timestamp without time zone not null default now(),
  constraint "contentTypes_pkey" primary key ("id"),
  constraint "contentTypes_app_table_key" unique ("appId", "tableName")
);

alter table "platform"."contentTypes" enable row level security;

alter table "platform"."contentTypes"
  add constraint "contentTypes_appId_fkey"
    foreign key ("appId") references "platform"."apps"("id") on delete cascade;

-- Two rows naming the same contentType within one app would make
-- resolve_content ambiguous, and the unique constraint above cannot see the
-- derived default this coalesces to. Only rows that override the default are
-- constrained; the derived defaults are already unique because table names are.
create unique index "contentTypes_app_type_idx"
  on "platform"."contentTypes" using btree ("appId", "contentType")
  where ("contentType" is not null);

-- A typo in any of these names would not fail anywhere obvious: the type would
-- keep resolving from the derived defaults, or vanish from content_types()
-- entirely, and the app would look configured while being wrong. Checking at
-- write time turns that into a failed migration.
create or replace function "platform".validate_content_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  schema_name text;
  rel_oid oid;
  col text;
begin
  select a."schemaName" into schema_name
  from "platform"."apps" a where a."id" = new."appId";

  select c.oid into rel_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = schema_name
    and c.relname = new."tableName"
    and c.relkind in ('r', 'p');

  if rel_oid is null then
    raise exception 'platform.contentTypes: table "%"."%" does not exist',
      schema_name, new."tableName";
  end if;

  if new."authorColumn" is not null
     and not exists (
       select 1 from pg_catalog.pg_attribute
       where attrelid = rel_oid and attname = new."authorColumn"
         and attnum > 0 and not attisdropped
     ) then
    raise exception 'platform.contentTypes: "%"."%" has no column "%"',
      schema_name, new."tableName", new."authorColumn";
  end if;

  foreach col in array coalesce(new."snapshotColumns", '{}'::text[]) loop
    if not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = rel_oid and attname = col
        and attnum > 0 and not attisdropped
    ) then
      raise exception 'platform.contentTypes: "%"."%" has no column "%"',
        schema_name, new."tableName", col;
    end if;
  end loop;

  return new;
end;
$$;

create trigger "contentTypes_validate"
  before insert or update on "platform"."contentTypes"
  for each row execute function "platform".validate_content_type();

-- Readable by any signed-in user for the same reason report reasons are: a
-- client has to know what it may report before it can offer the affordance.
create policy "authenticated_select"
  on "platform"."contentTypes"
  as permissive for select to authenticated
  using (true);

-- Written by migrations only. Split per command rather than one `for all`,
-- because a restrictive `for all ... using (false)` also applies to SELECT and
-- would silently override the read policy above.
create policy "no_client_insert"
  on "platform"."contentTypes"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."contentTypes"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."contentTypes"
  as restrictive for delete to anon, authenticated
  using (false);

-- Org-wide configuration granting unconditional `authenticated` SELECT, which
-- is exactly the category 20260729000000 denies to test identities.
create policy "deny_test_identities"
  on "platform"."contentTypes"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));

-- ============================================================
-- Derivation
-- ============================================================

-- One row per moderatable content type across every registered app.
--
-- A type appears here when its table carries the foreign key to
-- "reportResolutions", OR when a row in "contentTypes" declares it. Everything
-- else is a default with an override.
--
-- Deliberately returns misconfigured types rather than filtering them out:
-- "refColumn"/"authorColumn" come back null when they cannot be derived, so the
-- conformance check can say what is wrong. Omitting them would make a broken
-- type indistinguishable from an unregistered one -- an invisible
-- misconfiguration, which is the failure mode this whole design is trying to
-- avoid.
--
-- Execute is revoked from clients: this exposes the shape of every app's schema
-- and is reached through the moderator-gated list_content_types() instead.
create or replace function "platform".content_types()
returns table (
  "appId"            uuid,
  "appSlug"          text,
  "schemaName"       text,
  "tableName"        text,
  "contentType"      text,
  "label"            text,
  "refColumn"        text,
  "authorColumn"     text,
  "snapshotColumns"  text[],
  "urlTemplate"      text,
  "visibility"       "platform"."contentVisibility",
  "quarantineColumn" text
)
language sql
stable
security definer
set search_path = ''
as $$
with app_tables as (
  select
    a."id"          as app_id,
    a."slug"        as app_slug,
    a."schemaName"  as schema_name,
    c.oid           as rel_oid,
    c.relname::text as table_name
  from "platform"."apps" a
  join pg_catalog.pg_namespace n on n.nspname = a."schemaName"
  join pg_catalog.pg_class c
    on c.relnamespace = n.oid and c.relkind in ('r', 'p')
),
-- The column holding the FK to reportResolutions. Its presence is the
-- registration, and its name is where apply_content_action writes.
quarantine_col as (
  select t.rel_oid, att.attname::text as col
  from app_tables t
  join pg_catalog.pg_constraint fk
    on fk.conrelid = t.rel_oid
   and fk.contype = 'f'
   and fk.confrelid = '"platform"."reportResolutions"'::regclass
   and array_length(fk.conkey, 1) = 1
  join pg_catalog.pg_attribute att
    on att.attrelid = t.rel_oid and att.attnum = fk.conkey[1]
),
-- The single-column primary key, which is what a contentRef addresses. A
-- composite key produces no row, so "refColumn" is null and the type reports as
-- unresolvable rather than silently disappearing.
ref_col as (
  select t.rel_oid, att.attname::text as col
  from app_tables t
  join pg_catalog.pg_constraint pk
    on pk.conrelid = t.rel_oid
   and pk.contype = 'p'
   and array_length(pk.conkey, 1) = 1
  join pg_catalog.pg_attribute att
    on att.attrelid = t.rel_oid and att.attnum = pk.conkey[1]
),
-- The table's foreign key to auth.users. `having count(*) = 1` is the point:
-- two such keys are ambiguous, so nothing is derived and "authorColumn" must be
-- set explicitly rather than guessed at.
author_col as (
  select rel_oid, min(col) as col
  from (
    select t.rel_oid, att.attname::text as col
    from app_tables t
    join pg_catalog.pg_constraint fk
      on fk.conrelid = t.rel_oid
     and fk.contype = 'f'
     and fk.confrelid = 'auth.users'::regclass
     and array_length(fk.conkey, 1) = 1
    join pg_catalog.pg_attribute att
      on att.attrelid = t.rel_oid and att.attnum = fk.conkey[1]
  ) s
  group by rel_oid
  having count(*) = 1
),
text_cols as (
  select t.rel_oid, array_agg(att.attname::text order by att.attnum) as cols
  from app_tables t
  join pg_catalog.pg_attribute att
    on att.attrelid = t.rel_oid
   and att.attnum > 0
   and not att.attisdropped
   and att.atttypid in ('pg_catalog.text'::regtype, 'pg_catalog.varchar'::regtype)
  group by t.rel_oid
)
select
  t.app_id,
  t.app_slug,
  t.schema_name,
  t.table_name,
  coalesce(o."contentType", t.table_name),
  coalesce(o."label", initcap(replace(t.table_name, '_', ' '))),
  r.col,
  coalesce(o."authorColumn", au.col),
  coalesce(o."snapshotColumns", tc.cols, '{}'::text[]),
  o."urlTemplate",
  coalesce(o."visibility", 'restricted'::"platform"."contentVisibility"),
  q.col
from app_tables t
left join "platform"."contentTypes" o
  on o."appId" = t.app_id and o."tableName" = t.table_name
left join quarantine_col q  on q.rel_oid  = t.rel_oid
left join ref_col        r  on r.rel_oid  = t.rel_oid
left join author_col     au on au.rel_oid = t.rel_oid
left join text_cols      tc on tc.rel_oid = t.rel_oid
where q.col is not null or o."id" is not null;
$$;

-- Locking a function down takes both halves of this, and leaving either out
-- fails open with no error:
--
--   * Postgres grants EXECUTE to PUBLIC on every function by default, and
--     revoking from anon and authenticated does not touch that grant -- they
--     still hold it through PUBLIC.
--   * `alter default privileges in schema platform grant all on functions to
--     anon, authenticated, service_role` (20260616232300_platform_init.sql) then
--     grants it to them a second time, directly, so revoking from PUBLIC alone
--     is not enough either.
--
-- service_role keeps its grant: it is the trusted server key, and the console
-- reaches these through the `postgres` role in any case.
revoke execute on function "platform".content_types()
  from public, anon, authenticated;
revoke execute on function "platform".validate_content_type()
  from public, anon, authenticated;

-- ============================================================
-- Config-table policies left dangling by the appId rename
-- ============================================================

-- 20260730000001 renamed "clientId" to "appId" on these tables. Postgres
-- rewrites policy expressions through a rename, so these policies survived as
-- `oauthRegistrations."clientId" = "reportReasons"."appId"` -- comparing an
-- OAuth client id against an app id, which can never match. They therefore deny
-- silently, which nothing noticed because the console writes through Drizzle as
-- the `postgres` role and bypasses RLS entirely.
--
-- Replaced with what ownership now means. There is no per-app owner any more:
-- managing report reasons is `canModerate` and managing feedback topics is
-- `canManageFeedback`, the same permissions the server actions already check.
drop policy if exists "owner_insert" on "platform"."reportReasons";
drop policy if exists "owner_delete" on "platform"."reportReasons";
drop policy if exists "owner_insert" on "platform"."feedbackTopics";
drop policy if exists "owner_delete" on "platform"."feedbackTopics";

create policy "moderator_insert"
  on "platform"."reportReasons"
  as permissive for insert to authenticated
  with check ("platform".has_permission((select auth.uid()), 'canModerate'));

create policy "moderator_update"
  on "platform"."reportReasons"
  as permissive for update to authenticated
  using ("platform".has_permission((select auth.uid()), 'canModerate'))
  with check ("platform".has_permission((select auth.uid()), 'canModerate'));

create policy "moderator_delete"
  on "platform"."reportReasons"
  as permissive for delete to authenticated
  using ("platform".has_permission((select auth.uid()), 'canModerate'));

create policy "manager_insert"
  on "platform"."feedbackTopics"
  as permissive for insert to authenticated
  with check ("platform".has_permission((select auth.uid()), 'canManageFeedback'));

create policy "manager_update"
  on "platform"."feedbackTopics"
  as permissive for update to authenticated
  using ("platform".has_permission((select auth.uid()), 'canManageFeedback'))
  with check ("platform".has_permission((select auth.uid()), 'canManageFeedback'));

create policy "manager_delete"
  on "platform"."feedbackTopics"
  as permissive for delete to authenticated
  using ("platform".has_permission((select auth.uid()), 'canManageFeedback'));

-- Left over from the same rename: an UPDATE policy denying everyone, which now
-- sits alongside the permissive one above and would win.
drop policy if exists "crud_public_policy_update" on "platform"."feedbackTopics";
