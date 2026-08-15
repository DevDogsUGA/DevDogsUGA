-- The app registry, and a way for the first user on a fresh instance to become
-- Root.
--
-- Until now "which app is this?" has been answered by an OAuth client id:
-- "contentReports"."clientId" references auth.oauth_clients, so identifying an
-- application and identifying an OAuth client were the same question. That made
-- sense when every app had its own backend and reached DevDogs over HTTP. It
-- does not survive the shared instance, where an app is a Postgres schema and
-- OAuth is only how a contributor signs in during development.
--
-- Splitting them is what lets the whole moderation/feedback surface stop
-- referencing OAuth concepts, which in turn is what keeps a future change to
-- the auth model from reaching into reports and feedback at all.

-- ============================================================
-- Registry
-- ============================================================

create table "platform"."apps" (
  "id"          uuid not null default gen_random_uuid(),
  "slug"        text not null,
  "schemaName"  text not null,
  "displayName" text not null,
  -- Optional escape hatch for content that a declarative content type cannot
  -- describe -- assembled across tables, or a quarantine that cascades.
  -- Stored as a text signature ('forum.resolve_content(text,text)') resolved
  -- with to_regprocedure() at call time rather than as a regprocedure column:
  -- an OID goes stale the moment the function is dropped and recreated, which
  -- migrations do routinely, and does not survive dump/restore.
  -- Populated when the dispatcher lands; null means "use the declarative path".
  "contentResolver" text,
  "contentActioner" text,
  "createdAt"   timestamp without time zone not null default now(),
  constraint "apps_pkey" primary key ("id"),
  constraint "apps_slug_key" unique ("slug"),
  constraint "apps_schemaName_key" unique ("schemaName")
);

alter table "platform"."apps" enable row level security;

-- A typo in "schemaName" would not fail anywhere obvious -- content-type
-- detection would simply find nothing, and the app would look correctly
-- configured while being silently invisible to moderation. Checking at write
-- time turns that into a failed migration instead.
create or replace function "platform".validate_app_schema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_namespace where nspname = new."schemaName"
  ) then
    raise exception 'platform.apps: schema "%" does not exist', new."schemaName";
  end if;
  return new;
end;
$$;

create trigger "apps_validate_schema"
  before insert or update on "platform"."apps"
  for each row execute function "platform".validate_app_schema();

-- Which apps exist is public information: the contributor tooling lists them
-- to pick one, and it does so before anybody has signed in.
create policy "public_select"
  on "platform"."apps"
  as permissive for select to anon, authenticated
  using (true);

-- Registry writes come from migrations only. Split per command rather than
-- written as one `for all`, because a restrictive `for all ... using (false)`
-- also applies to SELECT and would silently override the read policy above.
create policy "no_client_insert"
  on "platform"."apps"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."apps"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."apps"
  as restrictive for delete to anon, authenticated
  using (false);

-- Every schema that exists today. The forum joins this list when it migrates;
-- schedule_builder and study_group_finder are registered even though neither
-- has moderatable content yet, because the registry is also what the tooling
-- enumerates and an app with nothing to moderate should still be selectable.
insert into "platform"."apps" ("slug", "schemaName", "displayName") values
  ('platform',            'platform',            'DevDogs Platform'),
  ('schedule_builder',    'schedule_builder',    'Optimal Schedule Builder'),
  ('study_group_finder',  'study_group_finder',  'Study Group Finder');

-- ============================================================
-- Bootstrapping Root on a fresh instance
-- ============================================================
--
-- Every console page resolves through getCallerContext(), which reads
-- "resolvedUserPermissions". A user with no roles resolves to all-permissions-
-- false, so on a brand new instance the console is simply invisible -- there is
-- no error and nothing to click, which is the exact trap documented in
-- 20260728000000_platform_resolved_permissions_triggers.sql. Somebody has to be
-- able to grant themselves the first role.
--
-- THIS USED TO BE AN RPC, `platform.claim_root()`: any authenticated caller
-- could take Root as long as nobody held it, gated on the instance not
-- reporting itself as production. Both halves of that were wrong.
--
-- The gate was a row in a table, so "is this production?" was answered by data
-- that had to be set correctly on every instance, could not be verified by CI,
-- and was writable by anything holding the service key. And the capability it
-- guarded is a privilege escalation by construction: on a freshly reset
-- production database with sign-up open to the whole university, Root would go
-- to whoever authenticated first.
--
-- Now there is no RPC and nothing to gate. Root is granted by writing the row
-- directly -- `pnpm devtools grant-root`, the Supabase dashboard, or psql --
-- all of which require the service key or a database password. That is a
-- credential only somebody who already controls the instance holds, which makes
-- the authorization structural instead of a self-assertion the database has to
-- take on trust.
--
--   insert into "platform"."userRoles" ("userId", "roleId")
--   values ('<your auth.users id>', '00000000-0000-0000-0000-000000000002');
--
-- "userRoles_root_singleton" still enforces that at most one user holds it.
