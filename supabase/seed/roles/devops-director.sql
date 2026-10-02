-- DevOps Director: insert-only, safe to run again.
--
-- `on conflict do nothing` means a rerun never overwrites an edit made in the
-- console, so a role that already exists is left exactly as it is. Corrections
-- go through the console, the CLI or a one-off migration, not this file.
--
-- Permission columns are nullable. TRUE grants a capability and NULL expresses
-- no opinion, allowing another held role to grant it. Seeded roles never use
-- FALSE, so an officer's roles compose as the union of their grants.
--
-- DevOps Director has no Discord counterpart yet, so it is inserted unlinked and linked
-- from the Permissions page.

insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "showOnProfile", "isLeadership",
  "color", "discordRoleId", "discordSyncedName", "discordSyncedColor",
  "canModerate", "canManageRoles", "canManageSuspensions",
  "canViewAuditLog",
  "canManageAttendance", "canExportStars", "canPreviewDocs"

)
values
  (
    '00000000-0000-4000-8000-000000000003',
    'DevOps Director',
    'Maintains the platform and its deployment infrastructure.',
    'custom', 300, true, true,
    null, null, null, null,
    true, true, true, true, true, true, true
  )
on conflict do nothing;
