-- The app registry: platform."apps", its schema-name validation trigger, its
-- four policies, and the three rows every downstream file resolves by slug.
--
-- An app is a Postgres schema, not an OAuth client. Reports, content types and
-- projects all carry an "appId" pointing here, so this file has to precede all
-- of them. It also has to follow the schemas file, because the seed at the
-- bottom fires apps_validate_schema, which checks pg_namespace: registering an
-- app whose schema does not exist yet fails the migration.

-- ============================================================
-- Registry
-- ============================================================

create table "platform"."apps" (
  "id"          uuid not null default gen_random_uuid(),
  "slug"        text not null,
  "schemaName"  text not null,
  "displayName" text not null,
  -- Escape hatch for content a declarative content type cannot describe:
  -- assembled across tables, or a quarantine that cascades. Stored as a text
  -- signature ('forum.resolve_content(text,text)') resolved with
  -- to_regprocedure() at call time, not as a regprocedure column, because an
  -- OID goes stale the moment the function is dropped and recreated and does
  -- not survive dump/restore. Both columns are still null on all three seeded
  -- rows and nothing in the repo writes them. Null means "use the declarative
  -- path"; the dispatcher reads them, so do not drop them as dead columns.
  "contentResolver" text,
  "contentActioner" text,
  "createdAt"   timestamp without time zone not null default now(),
  constraint "apps_pkey" primary key ("id"),
  constraint "apps_slug_key" unique ("slug"),
  constraint "apps_schemaName_key" unique ("schemaName")
);

alter table "platform"."apps" enable row level security;

-- A typo in "schemaName" would not fail anywhere obvious. Content-type
-- detection would find nothing, and the app would look correctly configured
-- while being silently invisible to moderation. Checking at write time turns
-- that into a failed migration instead.
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

-- Which apps exist is public information: the contributor tooling lists them to
-- pick one, and it does so before anybody has signed in.
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
--
-- The 'platform' row is load-bearing beyond the tooling: later files resolve
-- `slug = 'platform'` to attach reports and the profile content type. Removing
-- it does not fail here, it fails three files down.
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
-- false, so on a brand new instance the console is simply invisible: no error,
-- nothing to click. Somebody has to grant themselves the first role, and there
-- is deliberately no RPC for it. Root is granted by writing the row directly,
-- via `pnpm devtools grant-root`, the Supabase dashboard, or psql, each of
-- which needs the service key or the database password. That is a credential
-- only somebody who already controls the instance holds, which makes the
-- authorization structural rather than a self-assertion the database has to
-- take on trust.
--
--   insert into "platform"."userRoles" ("userId", "roleId")
--   values ('<your auth.users id>', '00000000-0000-0000-0000-000000000002');
--
-- "userRoles_root_singleton" enforces that at most one user holds it.
