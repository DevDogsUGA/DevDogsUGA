-- Remove the roster-import permission.
--
-- The Involvement Network roster import moved from the console's Verification
-- page to `backstage involvement import`, which runs with the service role and
-- needs no role grant. `canManageVerification`, which gated the page, has
-- nothing left to gate. The profile columns the import writes
-- (`involvementFirstName`, `involvementLastName`, `involvementImportedAt`,
-- `ugaEmail`, `legal*`) stay: the CLI keeps filling them.
--
-- Order matters, as in file 43. `canManageVerification` is named by the roles
-- trigger's `update of` list and by the `resolvedUserPermissions` materialized
-- view (see files 06, 40 and 43), and neither can lose a column in place. So the
-- trigger and the view go first, then the column, then the view and trigger come
-- back without it with the unique index and grants that dropping a materialized
-- view takes with it. Nothing else depends on the view by object: the helper
-- functions are `language sql` with string bodies that resolve at call time.

drop trigger "roles_refresh_resolved_permissions" on "platform"."roles";

drop materialized view "platform"."resolvedUserPermissions";

alter table "platform"."roles" drop column "canManageVerification";

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
          "canManageAttendance",
          "canExportStars",
          "canPreviewDocs"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();
