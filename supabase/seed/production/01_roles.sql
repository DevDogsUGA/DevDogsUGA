-- The complete role catalogue for a freshly reset DevDogs database.
--
-- Definitions live here; people and assignments live in later seeds.
--
-- President is the top of the ladder: every permission is granted on it, and no
-- other role outranks it. It has the fixed id `devtools grant-root` writes, so
-- that command bootstraps the first President on an instance with nobody on it,
-- its service key proving control of the database. A permission column added
-- later has to be granted to President here as well; nothing grants it
-- implicitly. Because President is linked to Discord like the rest, anyone who
-- holds it in the guild and links Discord gets every permission here, and loses
-- them when the guild role goes.
--
-- Permission columns are nullable. TRUE grants a capability and NULL expresses
-- no opinion, allowing another held role to grant it. These seeded roles never
-- use FALSE: an officer's roles therefore compose as the union of their grants.

-- Every custom role with a counterpart in the DevDogs Discord guild arrives
-- already linked to it. `discordSyncedName`/`discordSyncedColor` are the last
-- synced snapshot, and they are seeded equal to the live Discord role, so the
-- first reconcile has nothing to push or pull. A role with no counterpart
-- (DevOps Director) is seeded unlinked, to be linked from the Permissions page.
-- Once linked, Discord role membership is authoritative for anyone who has
-- linked Discord: the `sync-discord-roles` cron grants and revokes to match.
--
-- The ids are the production guild's (`DISCORD_GUILD_ID`), which every tier
-- shares. President sits above RoboDog in the guild, so the bot can read who
-- holds it but cannot grant or revoke it there.
insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "showOnProfile", "isLeadership",
  "color", "discordRoleId", "discordSyncedName", "discordSyncedColor",
  "canModerate", "canManageRoles", "canManageSuspensions",
  "canViewAuditLog", "canCreateCredentials", "canManageVerification",
  "canManageAttendance", "canExportStars"
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Member',
    'Default role for every member. No special permissions.',
    'default', null, true, false,
    null, null, null, null,
    null, null, null, null, null, null, null, null
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'President',
    'President of DevDogs.',
    'custom', 100, true, true,
    '#9b59b6', '1237558680120070196', 'President', 10181046,
    true, true, true, true, true, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'Vice President',
    'Vice President of DevDogs.',
    'custom', 200, true, true,
    '#1abc9c', '1237559269474308107', 'Vice President', 1752220,
    true, true, true, true, true, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'DevOps Director',
    'Maintains the platform and its deployment infrastructure.',
    'custom', 300, true, true,
    null, null, null, null,
    true, true, true, true, true, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'External Affairs Director',
    'Leads the Campus Engagement and Corporate Outreach teams.',
    'custom', 400, true, true,
    '#1abc9c', '1513222394691715132', 'External Affairs Director', 1752220,
    null, null, null, null, null, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'Campus Engagement Team',
    'Builds participation and relationships across the UGA campus.',
    'custom', 500, true, true,
    '#1abc9c', '1237558784017305642', 'Campus Engagement Team', 1752220,
    null, null, null, null, null, true, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    'Corporate Outreach Team',
    'Builds relationships with companies, alumni, and technology professionals.',
    'custom', 600, true, true,
    '#1abc9c', '1237558910848733254', 'Corporate Outreach Team', 1752220,
    null, null, null, null, null, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000007',
    'Project Manager',
    'Leads delivery of a DevDogs project.',
    'custom', 700, true, true,
    '#1abc9c', '1390065004287627264', 'Project Manager', 1752220,
    null, null, null, null, null, null, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000008',
    'Focus Lead',
    'Leads a DevDogs focus area.',
    'custom', 800, true, true,
    '#1abc9c', '1283289579700621322', 'Focus Lead', 1752220,
    null, null, null, null, null, null, null, null
  )
on conflict ("title") do update set
  "description" = excluded."description",
  "roleType" = excluded."roleType",
  "rank" = excluded."rank",
  "showOnProfile" = excluded."showOnProfile",
  "isLeadership" = excluded."isLeadership",
  "color" = excluded."color",
  "discordRoleId" = excluded."discordRoleId",
  "discordSyncedName" = excluded."discordSyncedName",
  "discordSyncedColor" = excluded."discordSyncedColor",
  "canModerate" = excluded."canModerate",
  "canManageRoles" = excluded."canManageRoles",
  "canManageSuspensions" = excluded."canManageSuspensions",
  "canViewAuditLog" = excluded."canViewAuditLog",
  "canCreateCredentials" = excluded."canCreateCredentials",
  "canManageVerification" = excluded."canManageVerification",
  "canManageAttendance" = excluded."canManageAttendance",
  "canExportStars" = excluded."canExportStars";
