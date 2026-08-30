-- Resolved permissions: the snapshot every authorization check reads, the two
-- triggers that keep it current, and the three helper functions that policies
-- and TypeScript both call.
--
-- The thing to know before touching anything below: a permission is only real
-- if it appears in THREE places that have to agree. The column on
-- platform."roles" (previous file), the column in the materialized view body,
-- and the column name in the roles trigger's `update of` list. Miss the second
-- and has_permission() returns false for that name. Miss the third and edits to
-- the column never reach the snapshot, so the role reads as granted in the
-- console and resolves false everywhere it is checked. Neither failure raises
-- an error anywhere.
--
-- This file has to follow roles/userRoles, userSuspensions and
-- oauthTestAccounts. The three helpers are `language sql`, and Postgres parses
-- and resolves a string SQL body at CREATE time, so their tables must already
-- exist.

-- ============================================================
-- The snapshot
-- ============================================================

-- Resolution rules, in the order they apply:
--
--   * Holding the Root role (the fixed uuid below) is true for everything, with
--     rank -Infinity. It is not a role with every box ticked; it short-circuits.
--   * Otherwise, only roles of "roleType" = 'custom' contribute.
--   * Lowest rank wins, and only among roles that express an opinion. A null
--     means "this role says nothing about this permission", not "deny". That is
--     what lets a high role grant something without every lower role repeating
--     it.
--   * A user with no opinion anywhere resolves to false, rank Infinity.
--
-- Materializing this is not premature. Every console page render, the search
-- index and every policy that calls has_permission() resolve through it.
create materialized view "platform"."resolvedUserPermissions" as
with root_holders as (
  select ur."userId"
  from "platform"."userRoles" ur
  where ur."roleId" = '00000000-0000-0000-0000-000000000002'::uuid
),
user_custom_roles as (
  select
    ur."userId",
    r.rank,
    r."isLeadership",
    r."canModerate",
    r."canManageRoles",
    r."canManageSuspensions",
    r."canViewAuditLog",
    r."canCreateCredentials",
    r."canManageVerification",
    r."canEditAttendance",
    r."canExportStars",
    r."canTriggerSync",
    r."canVoteAsOfficer",
    r."canAuditBallots"
  from "platform"."userRoles" ur
  inner join "platform"."roles" r on r.id = ur."roleId" and r."roleType" = 'custom'
),
-- array_agg ... filter (where ... is not null) then [1] is the "first non-null
-- by rank" pick. min()/max() cannot express it: they would ignore the ordering
-- and treat false as an absent opinion.
first_non_null as (
  select
    ucr."userId",
    min(ucr.rank) as "minRank",
    bool_or(ucr."isLeadership") as "isLeader",
    (array_agg(ucr."canModerate" order by ucr.rank asc) filter (where ucr."canModerate" is not null))[1] as "canModerate",
    (array_agg(ucr."canManageRoles" order by ucr.rank asc) filter (where ucr."canManageRoles" is not null))[1] as "canManageRoles",
    (array_agg(ucr."canManageSuspensions" order by ucr.rank asc) filter (where ucr."canManageSuspensions" is not null))[1] as "canManageSuspensions",
    (array_agg(ucr."canViewAuditLog" order by ucr.rank asc) filter (where ucr."canViewAuditLog" is not null))[1] as "canViewAuditLog",
    (array_agg(ucr."canCreateCredentials" order by ucr.rank asc) filter (where ucr."canCreateCredentials" is not null))[1] as "canCreateCredentials",
    (array_agg(ucr."canManageVerification" order by ucr.rank asc) filter (where ucr."canManageVerification" is not null))[1] as "canManageVerification",
    (array_agg(ucr."canEditAttendance" order by ucr.rank asc) filter (where ucr."canEditAttendance" is not null))[1] as "canEditAttendance",
    (array_agg(ucr."canExportStars" order by ucr.rank asc) filter (where ucr."canExportStars" is not null))[1] as "canExportStars",
    (array_agg(ucr."canTriggerSync" order by ucr.rank asc) filter (where ucr."canTriggerSync" is not null))[1] as "canTriggerSync",
    (array_agg(ucr."canVoteAsOfficer" order by ucr.rank asc) filter (where ucr."canVoteAsOfficer" is not null))[1] as "canVoteAsOfficer",
    (array_agg(ucr."canAuditBallots" order by ucr.rank asc) filter (where ucr."canAuditBallots" is not null))[1] as "canAuditBallots"
  from user_custom_roles ucr
  group by ucr."userId"
),
all_users as (
  select distinct "userId" from "platform"."userRoles"
)
select
  au."userId",
  case when rh."userId" is not null then true else coalesce(fnn."canModerate", false) end as "canModerate",
  case when rh."userId" is not null then true else coalesce(fnn."canManageRoles", false) end as "canManageRoles",
  case when rh."userId" is not null then true else coalesce(fnn."canManageSuspensions", false) end as "canManageSuspensions",
  case when rh."userId" is not null then true else coalesce(fnn."canViewAuditLog", false) end as "canViewAuditLog",
  case when rh."userId" is not null then true else coalesce(fnn."canCreateCredentials", false) end as "canCreateCredentials",
  case when rh."userId" is not null then true else coalesce(fnn."canManageVerification", false) end as "canManageVerification",
  case when rh."userId" is not null then true else coalesce(fnn."canEditAttendance", false) end as "canEditAttendance",
  case when rh."userId" is not null then true else coalesce(fnn."canExportStars", false) end as "canExportStars",
  case when rh."userId" is not null then true else coalesce(fnn."canTriggerSync", false) end as "canTriggerSync",
  case when rh."userId" is not null then true else coalesce(fnn."canVoteAsOfficer", false) end as "canVoteAsOfficer",
  case when rh."userId" is not null then true else coalesce(fnn."canAuditBallots", false) end as "canAuditBallots",
  case when rh."userId" is not null then true else coalesce(fnn."isLeader", false) end as "isLeader",
  case when rh."userId" is not null then '-Infinity'::double precision else coalesce(fnn."minRank", 'Infinity'::double precision) end as "minRank"
from all_users au
left join root_holders rh on rh."userId" = au."userId"
left join first_non_null fnn on fnn."userId" = au."userId";

-- Required by `refresh materialized view concurrently`, which the trigger below
-- uses. Without it the view reads fine in psql and every trigger-driven refresh
-- raises.
create unique index "resolvedUserPermissions_userId_idx"
  on "platform"."resolvedUserPermissions" ("userId");

-- Explicit, unlike every table in this schema. The default privileges in the
-- first migration do not reach a materialized view, so without this line the
-- view is readable to the schema owner and 403s for every PostgREST client.
grant all on "platform"."resolvedUserPermissions"
  to anon, authenticated, service_role;

-- `create materialized view` already populated it, so this is belt and braces
-- for a database that gets here by some other path. It also documents the
-- requirement: `refresh ... concurrently` only works on a view that has been
-- populated at least once, so the view must never be created `with no data`.
refresh materialized view "platform"."resolvedUserPermissions";

-- ============================================================
-- Keeping the snapshot in step
-- ============================================================

-- The refresh is an invariant of the source tables, so it lives in the database
-- where no writer can bypass it, rather than in one application code path every
-- other writer has to remember to imitate. Seeding the first Root assignment,
-- restoring a dump and editing a row in the Supabase dashboard all reach
-- "userRoles" without going through the app.
--
-- Staleness fails closed in the worst way: getCallerContext() finds no row,
-- returns all-permissions-false, and the console disappears for a user who does
-- hold the role, with no error on any surface.
create or replace function platform.refresh_resolved_user_permissions()
returns trigger
language plpgsql
-- REFRESH requires ownership of the materialized view, which PostgREST's
-- service_role does not have. Security definer runs the body as the function
-- owner instead, which makes an empty search_path mandatory: nothing here may
-- resolve through a caller-controlled schema, so every name below is
-- schema-qualified.
security definer
set search_path = ''
as $$
begin
  -- CONCURRENTLY so readers keep being served mid-refresh, which matters when a
  -- permission read sits in the path of essentially every page render. It needs
  -- the unique index on "userId" above and takes an ExclusiveLock: SELECTs pass,
  -- a second concurrent refresh waits.
  refresh materialized view concurrently platform."resolvedUserPermissions";
  return null;
end;
$$;

-- Statement-level, so assigning ten roles in one statement refreshes once
-- rather than ten times.
--
-- This also covers both cascade paths into the table: deleting a role or an
-- auth.users row cascades to "userRoles", and the cascaded delete fires this
-- trigger.
create trigger "userRoles_refresh_resolved_permissions"
  after insert or update or delete or truncate on platform."userRoles"
  for each statement
  execute function platform.refresh_resolved_user_permissions();

-- Editing a role changes what its existing holders resolve to without touching
-- "userRoles" at all, so the roles table needs its own trigger.
--
-- The `update of` list is narrowed to the columns the view reads. The exclusion
-- that earns its keep is the Discord sync metadata ("discordSyncedName" and
-- "discordSyncedColor", rewritten by the reconcile loop): those are the only
-- frequent writes to this table and they cannot affect a resolved permission.
--
-- Adding a permission column to platform."roles" means adding it here and to
-- the view body above. The list is fifteen names and must stay in step with the
-- eleven permission columns plus id, rank, isLeadership and roleType.
create trigger "roles_refresh_resolved_permissions"
  after insert
     or update of
          "id",
          "rank",
          "isLeadership",
          "roleType",
          "canModerate",
          "canManageRoles",
          "canManageSuspensions",
          "canViewAuditLog",
          "canCreateCredentials",
          "canManageVerification",
          "canEditAttendance",
          "canExportStars",
          "canTriggerSync",
          "canVoteAsOfficer",
          "canAuditBallots"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();

-- ============================================================
-- Permission helpers
-- ============================================================

-- Mirrors resolveUserPermissions() in the app so policies and TypeScript agree
-- by construction instead of by review. Authorization used to live entirely in
-- TypeScript, which meant a policy needing the same answer had to inline the
-- userRoles/roles join by hand. That is how the two drift apart.
--
-- `perm` is looked up as a JSON key rather than interpolated into SQL, so an
-- unknown or hostile value yields NULL, then false, rather than anything
-- executable. The same property is why a dropped permission column denies
-- silently instead of erroring, which is safe but invisible.
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
-- instead of each app polling a standing endpoint and applying it itself.
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

-- Test accounts are backed by real auth.users rows on the production instance,
-- because Supabase requires OAuth clients to run over HTTPS and the OAuth
-- server therefore has to live in production. That makes a test-account token an
-- ordinary `authenticated` token: any policy permissive enough to say
-- `using (true)` is readable by one.
--
-- Their legitimate job is narrow. They are sign-in targets for verifying an
-- OAuth integration and carry no application data, so denying them everything
-- else costs nothing.
--
-- This reads the table rather than a JWT claim: the custom_access_token hook is
-- commented out in config.toml, so there is no claim to read today. Swapping the
-- body for a claim lookup later is a drop-in change and every policy keeps
-- working.
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

-- Restrictive, so it composes with AND against the permissive policies already
-- on platform."roles" and subtracts test identities from whatever those allow
-- without restating them.
--
-- Scoped to tables that grant unconditional `authenticated` SELECT over
-- organisation-wide configuration. platform."roles" is the full role structure.
-- Member data is not listed because it is already own-row-only (profile) or
-- already denied to clients outright (credentials). The sibling
-- deny_test_identities policies live with their own tables, on reportReasons and
-- contentTypes in the moderation layer.
create policy "deny_test_identities"
  on "platform"."roles"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));
