-- Drop "canManageFeedback" now that there is no feedback to manage.
--
-- Same drop-and-rebuild as 20260803000005 and 20260803000007, and for the same
-- reason: a materialized view cannot be replaced in place, and its unique index
-- and grants have to come back with it or it reads correctly in psql and fails
-- for every client. This is the third rebuild of resolvedUserPermissions and
-- the first that removes a column rather than adding one.
--
-- Order matters here in a way the earlier two did not have to think about:
--
--   1. the refresh trigger names the column in its `update of` list, so it is
--      dropped first -- otherwise dropping the column either takes the trigger
--      with it or refuses, depending on how you ask;
--   2. the materialized view selects the column, so it goes next;
--   3. only then can the column itself go;
--   4. then the view and the trigger are rebuilt without it.
--
-- has_permission() resolves a permission by name against this view and returns
-- false for a name it does not find, so any straggling caller of
-- has_permission(uid, 'canManageFeedback') silently denies rather than erroring.
-- That is the safe direction, but it is also why a straggler would be invisible
-- -- the application-side references are removed in the same change.

drop trigger "roles_refresh_resolved_permissions" on "platform"."roles";

drop materialized view "platform"."resolvedUserPermissions";

alter table "platform"."roles" drop column "canManageFeedback";

create materialized view "platform"."resolvedUserPermissions" as
with root_holders as (
  select ur."userId"
  from "platform"."userRoles" ur
  where ur."roleId" = '00000000-0000-0000-0000-000000000002'::uuid
),
user_custom_roles as (
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
    r."canEditAttendance",
    r."canExportStars",
    r."canTriggerSync",
    r."canVoteAsOfficer",
    r."canAuditBallots"
  from "platform"."userRoles" ur
  inner join "platform"."roles" r on r.id = ur."roleId" and r."roleType" = 'custom'
),
-- Lowest rank wins, and only among roles that express an opinion: a null
-- means "this role says nothing about this permission", not "deny". That is
-- what lets a high role grant something without every lower role having to
-- repeat it.
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
    (array_agg(ucr."canEditAttendance" order by ucr.rank asc) filter (where ucr."canEditAttendance" is not null))[1] as "canEditAttendance",
    (array_agg(ucr."canExportStars" order by ucr.rank asc) filter (where ucr."canExportStars" is not null))[1] as "canExportStars",
    (array_agg(ucr."canTriggerSync" order by ucr.rank asc) filter (where ucr."canTriggerSync" is not null))[1] as "canTriggerSync",
    (array_agg(ucr."canVoteAsOfficer" order by ucr.rank asc) filter (where ucr."canVoteAsOfficer" is not null))[1] as "canVoteAsOfficer",
    (array_agg(ucr."canAuditBallots" order by ucr.rank asc) filter (where ucr."canAuditBallots" is not null))[1] as "canAuditBallots"
  from user_custom_roles ucr
  group by ucr."userId"
),
all_users as (
  select distinct "userId" from "platform"."userRoles"
)
select
  au."userId",
  case when rh."userId" is not null then true else coalesce(fnn."canModerate", false) end as "canModerate",
  case when rh."userId" is not null then true else coalesce(fnn."canManageRoles", false) end as "canManageRoles",
  case when rh."userId" is not null then true else coalesce(fnn."canManageSuspensions", false) end as "canManageSuspensions",
  case when rh."userId" is not null then true else coalesce(fnn."canViewAuditLog", false) end as "canViewAuditLog",
  case when rh."userId" is not null then true else coalesce(fnn."canCreateCredentials", false) end as "canCreateCredentials",
  case when rh."userId" is not null then true else coalesce(fnn."canManageVerification", false) end as "canManageVerification",
  case when rh."userId" is not null then true else coalesce(fnn."canEditAttendance", false) end as "canEditAttendance",
  case when rh."userId" is not null then true else coalesce(fnn."canExportStars", false) end as "canExportStars",
  case when rh."userId" is not null then true else coalesce(fnn."canTriggerSync", false) end as "canTriggerSync",
  case when rh."userId" is not null then true else coalesce(fnn."canVoteAsOfficer", false) end as "canVoteAsOfficer",
  case when rh."userId" is not null then true else coalesce(fnn."canAuditBallots", false) end as "canAuditBallots",
  case when rh."userId" is not null then true else coalesce(fnn."isLeader", false) end as "isLeader",
  case when rh."userId" is not null then '-Infinity'::double precision else coalesce(fnn."minRank", 'Infinity'::double precision) end as "minRank"
from all_users au
left join root_holders rh on rh."userId" = au."userId"
left join first_non_null fnn on fnn."userId" = au."userId";

create unique index "resolvedUserPermissions_userId_idx"
  on "platform"."resolvedUserPermissions" ("userId");

grant all on "platform"."resolvedUserPermissions"
  to anon, authenticated, service_role;

refresh materialized view "platform"."resolvedUserPermissions";

-- The trigger's `update of` list is narrowed so the Discord reconcile loop's
-- writes do not refresh the view. A permission column missing from it is a
-- column whose edits never reach the snapshot.
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
          "canEditAttendance",
          "canExportStars",
          "canTriggerSync",
          "canVoteAsOfficer",
          "canAuditBallots"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();
