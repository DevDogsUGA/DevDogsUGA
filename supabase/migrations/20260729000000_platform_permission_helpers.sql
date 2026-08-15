-- The SQL-side permission helpers the rest of the moderation/feedback rebuild
-- is built on.
--
-- Authorization used to live entirely in TypeScript: canUserModerate() and
-- friends read the resolved-permissions view from the app. Policies that need
-- the same answer have to inline the userRoles/roles join by hand, which is how
-- they drift apart. One function, used by both, is the fix.
--
-- ⚠️ THIS FILE ALSO USED TO DEFINE AN ENVIRONMENT GATE -- a singleton
-- platform."instance" table holding 'local' | 'test' | 'production', plus
-- is_production() reading it -- and that half has been removed. It is worth
-- saying why, because "the database should know which tier it is" sounds
-- obviously correct.
--
-- It only ever had two consumers, and both were capabilities that should not
-- have existed rather than capabilities needing a guard:
--
--   * claim_root(), which let the first authenticated user on a non-production
--     instance grant themselves every permission. Removed outright; Root is now
--     granted with the service key, which only somebody who already controls
--     the database holds. See 20260730000000.
--
--   * the sandbox fixture schema, denied on production by a restrictive policy.
--     The schema is gone, so there is nothing left to deny.
--
-- What remained was a column that had to be set correctly on every instance for
-- anything to work, could not be checked by CI, and whose value nothing read.
-- A gate with no consumers is not defence in depth; it is a thing to get wrong.

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
