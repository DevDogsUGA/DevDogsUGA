-- Member and President always exist, and President holds every permission.
--
-- These used to be guaranteed only by the role seed, which upserted them on
-- every run. The seeds are insert-only now (`seed/roles/*.sql`), so the rule
-- lives here, where it reaches a database nobody is allowed to reset. Both rows
-- have fixed ids: Member is the default role every account holds, and President
-- is the id `devtools grant-root` writes to bootstrap the first President.
--
-- `on conflict do nothing` keeps this safe on a database that already has them,
-- whatever edits they carry. A permission column added later is granted to
-- President by the migration that adds it; nothing grants it implicitly.
--
-- President has no `discordRoleId`: it is granted on the platform only.
insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "showOnProfile", "isLeadership",
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
    null, null, null, null, null, null, null, null, null
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'President',
    'President of DevDogs.',
    'custom', 100, true, true,
    true, true, true, true, true, true, true, true, true
  )
on conflict do nothing;
