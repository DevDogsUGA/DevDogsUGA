-- Remove the shared-logins feature.
--
-- Shared logins (the club email, the Instagram) now live in Bitwarden Sends,
-- handed out by `backstage creds`. The console page, its tables, and the
-- `canCreateCredentials` permission that gated creating them are gone. Production
-- held no rows in `credentials`, so nothing is lost; the Vault cleanup below is
-- for any database that does.
--
-- Order matters. `canCreateCredentials` is named by the roles trigger's `update
-- of` list and by the `resolvedUserPermissions` materialized view (see files 06
-- and 40), and neither can lose a column in place. So the trigger and the view
-- go first, then the column, then the view and trigger come back without it with
-- the unique index and grants that dropping a materialized view takes with it.
-- Nothing else depends on the view by object: the helper functions are `language
-- sql` with string bodies that resolve at call time.

-- Vault secrets first, while "credentials" still says which ones are ours. Only
-- "credentials" holds secret ids; "credentialRoles" is a join table. A column
-- that was never set is null and matches nothing.
delete from vault.secrets
where id in (
  select "passwordSecretId" from "platform"."credentials" where "passwordSecretId" is not null
  union
  select "totpSecretId" from "platform"."credentials" where "totpSecretId" is not null
);

-- Dropping a table drops its RLS policies with it. "credentialRoles" goes first
-- because its foreign key points at "credentials".
drop table "platform"."credentialRoles";
drop table "platform"."credentials";
drop type "platform"."credentialType";

drop trigger "roles_refresh_resolved_permissions" on "platform"."roles";

drop materialized view "platform"."resolvedUserPermissions";

alter table "platform"."roles" drop column "canCreateCredentials";

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
          "canManageVerification",
          "canManageAttendance",
          "canExportStars",
          "canPreviewDocs"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();
