-- Campus Engagement Team: insert-only, safe to run again.
--
-- `on conflict do nothing` means a rerun never overwrites an edit made in the
-- console, so a role that already exists is left exactly as it is. Corrections
-- go through the console, the CLI or a one-off migration, not this file.
--
-- Permission columns are nullable. TRUE grants a capability and NULL expresses
-- no opinion, allowing another held role to grant it. Seeded roles never use
-- FALSE, so an officer's roles compose as the union of their grants.
--
-- A custom role with a Discord counterpart arrives linked to it, with
-- `discordSyncedName`/`discordSyncedColor` equal to the live Discord role, so
-- the first reconcile has nothing to push or pull. The ids are the production
-- guild's (`DISCORD_GUILD_ID`), which every tier shares. These columns are only
-- written when the role is first inserted; linking or relinking a role to
-- Discord afterwards goes through the console's link flow, which also fixes up
-- memberships and the snapshot.

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
    '00000000-0000-4000-8000-000000000005',
    'Campus Engagement Team',
    'Builds participation and relationships across the UGA campus.',
    'custom', 500, true, true,
    '#1abc9c', '1237558784017305642', 'Campus Engagement Team', 1752220,
    null, null, null, null, null, true, true, null, true
  )
on conflict do nothing;
