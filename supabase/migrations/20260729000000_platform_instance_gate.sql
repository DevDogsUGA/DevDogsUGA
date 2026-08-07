-- Environment gate + the SQL-side permission helpers the rest of the
-- moderation/feedback rebuild is built on.
--
-- Two problems this solves.
--
-- First, every tier of this project replays the same migrations, so the
-- database itself has no idea whether it is production or a contributor's
-- throwaway instance. Development-only capabilities (seeded personas, the
-- sandbox fixture app, claiming Root) are today gated -- where they are gated
-- at all -- in the console UI, which means a routing mistake or a stale build
-- is all that stands between production and a capability that should be
-- impossible there. Moving the gate into RLS makes it a property of the data
-- rather than of the code that happens to be in front of it.
--
-- Second, authorization currently lives in TypeScript: canUserModerate() and
-- friends read the resolved-permissions view from the app. Policies that need
-- the same answer have to inline the userRoles/roles join by hand, which is how
-- they drift apart. One function, used by both, is the fix.

-- ============================================================
-- Environment
-- ============================================================

create type "platform"."deployEnv" as enum ('local', 'test', 'production');

-- Single row, enforced by a primary key that can only ever hold `true`.
create table "platform"."instance" (
  "id"          boolean not null default true,
  "environment" "platform"."deployEnv" not null default 'production',
  constraint "instance_pkey" primary key ("id"),
  constraint "instance_singleton" check ("id")
);

alter table "platform"."instance" enable row level security;

-- The default is deliberately 'production', which is the *restrictive* value:
-- a fresh database denies every dev-only capability until something explicitly
-- says otherwise. Defaulting to 'local' would fail open -- forgetting to set it
-- on the real production project would silently permit seeded personas and let
-- the contributor tooling point at live data, and nothing would look wrong.
--
-- Non-production instances are demoted by `supabase/seed/00_instance.sql`,
-- which runs on `supabase db reset`. Production is never reset, so it keeps the
-- default it was created with and no operator has to remember anything.
insert into "platform"."instance" ("id", "environment") values (true, 'production');

-- Which tier you are on is not a secret -- the contributor tooling has to read
-- it before it will agree to target an instance, and it does so from the
-- browser as an anonymous user.
create policy "public_select"
  on "platform"."instance"
  as permissive for select to anon, authenticated
  using (true);

-- Writable only by service role / migrations. If a client could set this, the
-- gate would be worth nothing.
--
-- Split per command rather than written as one `for all`: a restrictive
-- `for all ... using (false)` also applies to SELECT, which would silently
-- override the permissive read policy above and make the table invisible.
create policy "no_client_insert"
  on "platform"."instance"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."instance"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."instance"
  as restrictive for delete to anon, authenticated
  using (false);

create or replace function "platform".is_production()
returns boolean
language sql
stable
-- security definer so the answer does not depend on the caller being able to
-- read the table; empty search_path so nothing here resolves through a
-- caller-controlled schema.
security definer
set search_path = ''
as $$
  select coalesce(
    (select "environment" = 'production' from "platform"."instance" where "id"),
    true  -- no row at all is treated as production, for the same fail-closed reason
  );
$$;

-- ============================================================
-- Permission helpers
-- ============================================================

-- Mirrors resolveUserPermissions() in the app so policies and TypeScript agree
-- by construction instead of by review.
--
-- `perm` is looked up as a JSON key rather than interpolated into SQL, so an
-- unknown or hostile value yields NULL -> false rather than anything executable.
--
-- Staleness contract: "resolvedUserPermissions" is a materialized view. It is
-- kept current by the statement-level triggers added in
-- 20260728000000_platform_resolved_permissions_triggers.sql, so a permission
-- change is visible as soon as the statement that made it commits. Anything
-- that writes userRoles/roles by a path those triggers do not cover would make
-- this answer stale -- there is no such path today, and adding one would be the
-- bug.
create or replace function "platform".has_permission(uid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (to_jsonb(r) ->> perm)::boolean
      from "platform"."resolvedUserPermissions" r
      where r."userId" = uid
    ),
    false
  );
$$;

-- The cross-app ban. Every app's write policies are expected to carry
--
--   and not "platform".is_suspended((select auth.uid()))
--
-- which is what makes a DevDogs suspension take effect everywhere at once
-- instead of each app polling a standing endpoint and applying it themselves.
create or replace function "platform".is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from "platform"."userSuspensions" s
    where s."userId" = uid and s."service" = 'global'
  );
$$;

-- ============================================================
-- Test identities
-- ============================================================

-- Test accounts are backed by real auth.users rows on the production instance,
-- because Supabase requires OAuth clients to run over HTTPS and the OAuth
-- server therefore has to live in production. That makes a test-account token
-- an ordinary `authenticated` token: any policy permissive enough to say
-- `using (true)` is readable by one.
--
-- Their legitimate job is narrow -- they are sign-in targets for verifying an
-- OAuth integration, and they carry no application data -- so denying them
-- everything else costs nothing.
--
-- This reads the table rather than a JWT claim: the custom_access_token hook is
-- commented out in config.toml, so there is no claim to read today. Swapping the
-- body for a claim lookup later is a drop-in change, and every policy below
-- keeps working.
create or replace function "platform".is_test_identity(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from "platform"."oauthTestAccounts" t where t."testUserId" = uid
  );
$$;

-- Restrictive policies compose with AND against the permissive ones already on
-- these tables, so each of these subtracts test identities from whatever the
-- existing policy allows without restating it.
--
-- Scoped to the tables that currently grant unconditional `authenticated`
-- SELECT and expose organisation-wide configuration: the full role structure,
-- and every registered app's reporting and feedback configuration. Member data
-- is not listed because it is already own-row-only ("platform"."profile") or
-- already denied to clients outright ("platform"."credentials").
create policy "deny_test_identities"
  on "platform"."roles"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));

create policy "deny_test_identities"
  on "platform"."reportReasons"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));

create policy "deny_test_identities"
  on "platform"."reportContentTypes"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));

create policy "deny_test_identities"
  on "platform"."feedbackTopics"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));
