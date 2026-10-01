-- President: insert-only, safe to run again.
--
-- `on conflict do nothing` means a rerun never overwrites an edit made in the
-- console, so a role that already exists is left exactly as it is. Corrections
-- go through the console, the CLI or a one-off migration, not this file.
--
-- Permission columns are nullable. TRUE grants a capability and NULL expresses
-- no opinion, allowing another held role to grant it. Seeded roles never use
-- FALSE, so an officer's roles compose as the union of their grants.
--
-- President is the top of the ladder, and no other role outranks it. It has the
-- fixed id `devtools grant-root` writes, so that command can bootstrap the
-- first President on an instance with nobody on it. That Member and President
-- exist, and that President holds every permission, is guaranteed by the
-- 20261001130000_42_platform_core_roles.sql migration (a permission column added
-- later is granted to President by its own migration), not by this seed.
--
-- President has no `discordRoleId`: it is granted and revoked on the platform
-- only, and the President role in the guild is managed by hand.

insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "showOnProfile", "isLeadership",
  "color", "discordRoleId", "discordSyncedName", "discordSyncedColor",
  "canModerate", "canManageRoles", "canManageSuspensions",
  "canViewAuditLog", "canCreateCredentials", "canManageVerification",
  "canManageAttendance", "canExportStars", "canPreviewDocs"

)
values
  (
    '00000000-0000-0000-0000-000000000002',
    'President',
    'President of DevDogs.',
    'custom', 100, true, true,
    '#9b59b6', null, null, null,
    true, true, true, true, true, true, true, true, true
  )
on conflict do nothing;
