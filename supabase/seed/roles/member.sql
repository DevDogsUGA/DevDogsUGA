-- Member: insert-only, safe to run again.
--
-- `on conflict do nothing` means a rerun never overwrites an edit made in the
-- console, so a role that already exists is left exactly as it is. Corrections
-- go through the console, the CLI or a one-off migration, not this file.
--
-- Permission columns are nullable. TRUE grants a capability and NULL expresses
-- no opinion, allowing another held role to grant it. Seeded roles never use
-- FALSE, so an officer's roles compose as the union of their grants.
--
-- Member is the default role every account holds. TASK-439 audits what it
-- should carry; until then it grants nothing.

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
    '00000000-0000-0000-0000-000000000001',
    'Member',
    'Default role for every member. No special permissions.',
    'default', null, true, false,
    null, null, null, null,
    null, null, null, null, null, null, null, null, null
  )
on conflict do nothing;
