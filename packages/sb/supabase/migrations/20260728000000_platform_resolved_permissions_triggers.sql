-- Keep platform."resolvedUserPermissions" in step with its source tables.
--
-- Every permission check in the app reads that materialized view: the console
-- dropdown, the pages indexed by search, and each console page's own
-- server-side gate all resolve through getCallerContext(). A materialized view
-- only reflects its sources as of the last refresh, and until now the only
-- thing that refreshed it was refreshUserPermissions() in the app, called from
-- the role-mutation server actions.
--
-- So any write that reached "userRoles"/"roles" another way -- seeding the
-- initial Root assignment, restoring a dump, an edit in the Supabase dashboard
-- -- left the snapshot stale. Staleness is silent and it fails closed in the
-- worst way: getCallerContext() finds no row, returns all-permissions-false,
-- and the console simply disappears for a user who does hold the role, with no
-- error on any surface. That is how the first Root holder ended up unable to
-- open a single console page.
--
-- The refresh is an invariant of the source tables, so it belongs in the
-- database where no writer can bypass it, not in one code path that every
-- other writer has to remember to imitate.

create or replace function platform.refresh_resolved_user_permissions()
returns trigger
language plpgsql
-- REFRESH requires ownership of the materialized view, which PostgREST's
-- service_role does not have -- security definer runs the body as the function
-- owner instead. That makes an empty search_path mandatory: nothing here may
-- resolve through a caller-controlled schema, so every name below is
-- schema-qualified.
security definer
set search_path = ''
as $$
begin
  -- CONCURRENTLY so readers keep being served mid-refresh, which matters when
  -- a permission read sits in the path of essentially every page render. It
  -- requires the unique index on "userId" that the view already carries, and
  -- takes an ExclusiveLock: SELECTs pass, a second concurrent refresh waits.
  refresh materialized view concurrently platform."resolvedUserPermissions";
  return null;
end;
$$;

-- Statement-level, so assigning ten roles in one statement refreshes once
-- rather than ten times.
--
-- This trigger also covers both cascade paths into the table: deleting a role
-- or an auth.users row cascades to "userRoles" (on delete cascade), and the
-- cascaded delete fires this trigger.
create trigger "userRoles_refresh_resolved_permissions"
  after insert or update or delete or truncate on platform."userRoles"
  for each statement
  execute function platform.refresh_resolved_user_permissions();

-- Editing a role changes what its existing holders resolve to without touching
-- "userRoles" at all, so the roles table needs its own trigger.
--
-- Narrowed to the columns the view actually reads. The exclusion that earns
-- its keep is the Discord sync metadata ("discordSyncedName"/"discordSyncedColor",
-- rewritten by the reconcile loop): those updates are the only frequent writes
-- to this table and they cannot affect a single resolved permission.
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
          "canManageFeedback",
          "canCreateCredentials",
          "canManageVerification"
     or delete
     or truncate
     on platform."roles"
  for each statement
  execute function platform.refresh_resolved_user_permissions();

-- The trigger only maintains the view from here on; it says nothing about what
-- the snapshot holds right now. Re-sync it once so the migration leaves the
-- view correct on every database it runs against, including any that already
-- drifted.
refresh materialized view platform."resolvedUserPermissions";
