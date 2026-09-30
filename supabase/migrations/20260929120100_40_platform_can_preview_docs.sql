-- `canPreviewDocs`: early access to scheduled docs pages.
--
-- A page scheduled for a future time 404s for everyone until then. This flag is
-- what lets a person read it early, at `/preview/docs/...`. It is its own
-- permission rather than `isLeadership` because the people who present a
-- workshop are not all officers, and the reverse.
--
-- Nullable like every other "can*" column: null says nothing, true grants, and
-- the resolver takes the lowest-ranked role with an opinion.
--
-- A permission is only real in three places (see file 06): the column, the
-- materialized view body, and the roles trigger's `update of` list. The view
-- cannot gain a column in place, so it is dropped and rebuilt with its unique
-- index and its grants; dropping a materialized view takes its ACL with it.
-- Nothing depends on it by object (the helper functions are `language sql`
-- with string bodies that resolve at call time), so the drop is clean.

alter table "platform"."roles" add column "canPreviewDocs" boolean;

drop materialized view "platform"."resolvedUserPermissions";

create materialized view "platform"."resolvedUserPermissions" as
with user_custom_roles as (
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
    r."canManageAttendance",
    r."canExportStars",
    r."canPreviewDocs"
  from "platform"."userRoles" ur
  inner join "platform"."roles" r on r.id = ur."roleId" and r."roleType" = 'custom'
),
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
    (array_agg(ucr."canManageAttendance" order by ucr.rank asc) filter (where ucr."canManageAttendance" is not null))[1] as "canManageAttendance",
    (array_agg(ucr."canExportStars" order by ucr.rank asc) filter (where ucr."canExportStars" is not null))[1] as "canExportStars",
    (array_agg(ucr."canPreviewDocs" order by ucr.rank asc) filter (where ucr."canPreviewDocs" is not null))[1] as "canPreviewDocs"
  from user_custom_roles ucr
  group by ucr."userId"
),
all_users as (
  select distinct "userId" from "platform"."userRoles"
)
select
  au."userId",
  coalesce(fnn."canModerate", false) as "canModerate",
  coalesce(fnn."canManageRoles", false) as "canManageRoles",
  coalesce(fnn."canManageSuspensions", false) as "canManageSuspensions",
  coalesce(fnn."canViewAuditLog", false) as "canViewAuditLog",
  coalesce(fnn."canCreateCredentials", false) as "canCreateCredentials",
  coalesce(fnn."canManageVerification", false) as "canManageVerification",
  coalesce(fnn."canManageAttendance", false) as "canManageAttendance",
  coalesce(fnn."canExportStars", false) as "canExportStars",
  coalesce(fnn."canPreviewDocs", false) as "canPreviewDocs",
  coalesce(fnn."isLeader", false) as "isLeader",
  coalesce(fnn."minRank", 'Infinity'::double precision) as "minRank"
from all_users au
left join first_non_null fnn on fnn."userId" = au."userId";

create unique index "resolvedUserPermissions_userId_idx"
  on "platform"."resolvedUserPermissions" ("userId");

grant all on "platform"."resolvedUserPermissions"
  to anon, authenticated, service_role;

-- The trigger's column list has to name the new column, or editing it never
-- reaches the snapshot and the role reads as granted in the console while
-- resolving false everywhere it is checked.
drop trigger "roles_refresh_resolved_permissions" on "platform"."roles";

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
          "canManageAttendance",
          "canExportStars",
          "canPreviewDocs"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();

-- The officer roles get it. `supabase/seed/production/01_roles.sql` says the
-- same for a fresh database; this is for the one that already has the roles,
-- where the seed's upsert has already run. Every custom leadership role, by
-- their fixed ids: President, Vice President, DevOps Director, External Affairs
-- Director, Campus Engagement Team, Corporate Outreach Team, Project Manager and
-- Focus Lead. Roles someone created by hand are left alone.
update "platform"."roles"
set "canPreviewDocs" = true
where "id" in (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008'
);
