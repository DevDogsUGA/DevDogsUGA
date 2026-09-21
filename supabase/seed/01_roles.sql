-- The complete role catalogue for a freshly reset DevDogs database.
--
-- Definitions live here; people and assignments live in later seeds. In
-- particular, Root is deliberately left unassigned. A holder is chosen with
-- `pnpm devtools grant-root`, whose service key proves control of the database.
--
-- Permission columns are nullable. TRUE grants a capability and NULL expresses
-- no opinion, allowing another held role to grant it. These seeded roles never
-- use FALSE: an officer's roles therefore compose as the union of their grants.

-- Reconcile titles from the previous catalogue when this file is replayed by
-- `pnpm devtools db seed roles`. Assignments follow the role row, so a rename
-- does not detach an officer.
with
  "renamedEvents" as (
    update "platform"."roles" set "title" = 'External Affairs Director'
    where "title" = 'Events Director' returning "id"
  ),
  "renamedCampus" as (
    update "platform"."roles" set "title" = 'Campus Engagement Team'
    where "title" = 'Campus Outreach Director' returning "id"
  ),
  "renamedCorporate" as (
    update "platform"."roles" set "title" = 'Corporate Outreach Team'
    where "title" = 'Corporate Outreach Director' returning "id"
  ),
  "renamedDogPack" as (
    update "platform"."roles" set "title" = 'DogPack Project Manager'
    where "title" = 'DogPack Project Director' returning "id"
  ),
  "renamedDogDays" as (
    update "platform"."roles" set "title" = 'DogDays Project Manager'
    where "title" = 'DogDays Project Director' returning "id"
  )
insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "showOnProfile", "isLeadership",
  "canModerate", "canManageRoles", "canManageSuspensions",
  "canViewAuditLog", "canCreateCredentials", "canManageVerification",
  "canManageAttendance", "canExportStars", "canTriggerSync",
  "canVoteAsOfficer", "canAuditBallots"
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Member',
    'Default role for every member. No special permissions.',
    'default', null, true, false,
    null, null, null, null, null, null, null, null, null, null, null
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Root',
    'Break-glass authority above the custom-role hierarchy. Singleton and transferable.',
    'root', null, false, false,
    null, null, null, null, null, null, null, null, null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'President',
    'President of DevDogs.',
    'custom', 100, true, true,
    true, true, true, true, true, true, true, true, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'Vice President',
    'Vice President of DevDogs.',
    'custom', 200, true, true,
    true, true, true, true, true, true, true, true, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'DevOps Director',
    'Maintains the platform and its deployment infrastructure.',
    'custom', 300, true, true,
    true, true, true, true, true, true, true, true, true, true, true
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'External Affairs Director',
    'Leads the Campus Engagement and Corporate Outreach teams.',
    'custom', 400, true, true,
    null, null, null, null, null, true, true, true, true, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'Campus Engagement Team',
    'Builds participation and relationships across the UGA campus.',
    'custom', 500, true, true,
    null, null, null, null, null, true, true, null, true, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    'Corporate Outreach Team',
    'Builds relationships with companies, alumni, and technology professionals.',
    'custom', 600, true, true,
    null, null, null, null, null, null, null, null, true, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000007',
    'DogPack Project Manager',
    'Leads delivery of the DogPack project.',
    'custom', 700, true, true,
    null, null, null, null, null, null, true, null, true, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000008',
    'DogDays Project Manager',
    'Leads delivery of the DogDays project.',
    'custom', 800, true, true,
    null, null, null, null, null, null, true, null, true, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000009',
    'UI/UX Focus Lead',
    'Leads the UI/UX focus area.',
    'custom', 900, true, true,
    null, null, null, null, null, null, null, null, null, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000010',
    'Next.js Focus Lead',
    'Leads the Next.js focus area.',
    'custom', 1000, true, true,
    null, null, null, null, null, null, null, null, null, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    'Flutter Focus Lead',
    'Leads the Flutter focus area.',
    'custom', 1100, true, true,
    null, null, null, null, null, null, null, null, null, true, null
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    'Backend Integration Focus Lead',
    'Leads the backend integration focus area.',
    'custom', 1200, true, true,
    null, null, null, null, null, null, null, null, null, true, null
  )
on conflict ("title") do update set
  "description" = excluded."description",
  "roleType" = excluded."roleType",
  "rank" = excluded."rank",
  "showOnProfile" = excluded."showOnProfile",
  "isLeadership" = excluded."isLeadership",
  "canModerate" = excluded."canModerate",
  "canManageRoles" = excluded."canManageRoles",
  "canManageSuspensions" = excluded."canManageSuspensions",
  "canViewAuditLog" = excluded."canViewAuditLog",
  "canCreateCredentials" = excluded."canCreateCredentials",
  "canManageVerification" = excluded."canManageVerification",
  "canManageAttendance" = excluded."canManageAttendance",
  "canExportStars" = excluded."canExportStars",
  "canTriggerSync" = excluded."canTriggerSync",
  "canVoteAsOfficer" = excluded."canVoteAsOfficer",
  "canAuditBallots" = excluded."canAuditBallots";
