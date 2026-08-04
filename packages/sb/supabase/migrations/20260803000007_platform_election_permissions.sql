-- Two permissions for elections.
--
--   canVoteAsOfficer  Cast the single officer ballot in an officer election
--   canAuditBallots   Read ballots other than your own team's
--
-- These land BEFORE the elections tables, not after them as the design note's
-- migration table has it. The ballot read policies call
-- `has_permission(uid, 'canAuditBallots')`, and that function resolves a
-- permission by name against the materialized view -- an unknown name is not
-- an error, it returns false. So with the note's ordering the policies apply
-- cleanly and simply deny every officer until the later migration runs, which
-- is exactly the kind of failure nobody notices in a fresh database and
-- everybody notices during a live tally.
--
-- Same drop-and-rebuild as migration 5, and for the same reason: materialized
-- views cannot be replaced in place, and the unique index and grants have to
-- come back with the view or it reads correctly in psql and fails for clients.

alter table "platform"."roles"
  add column "canVoteAsOfficer" boolean,
  add column "canAuditBallots"  boolean;

drop materialized view "platform"."resolvedUserPermissions";

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
    r."canManageFeedback",
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
    (array_agg(ucr."canManageFeedback" order by ucr.rank asc) filter (where ucr."canManageFeedback" is not null))[1] as "canManageFeedback",
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
  case when rh."userId" is not null then true else coalesce(fnn."canManageFeedback", false) end as "canManageFeedback",
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
          "canManageFeedback",
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
