-- Three permissions for the meetings surfaces.
--
--   canEditAttendance  Add or remove attendance rows on any meeting
--   canExportStars     Download stars.csv
--   canTriggerSync     Run the Airtable sync by hand
--
-- There is deliberately NO `canManageMeetings`. Meetings, workshops,
-- competitions and side awards are authored in Airtable, and access to the
-- base IS the permission. A second one in Postgres would create two systems
-- that can disagree about who is an officer, and the Airtable one would win
-- regardless, because it is where the writes happen.
--
-- The three are separate rather than one `canManageAttendance` because they
-- have genuinely different audiences:
--
--   * canExportStars carries every member's email. Reading the whole club's
--     contact details is a different grant from correcting one roster.
--   * canTriggerSync is reachable from a button inside Airtable, where the
--     audience is everyone with base access rather than everyone who can fix
--     a roster.
--
-- Note the honest limit on all three: they gate the PLATFORM's surfaces only.
-- Anyone with Airtable access can export the roster and the attendance mirror
-- from the base directly, and no Postgres permission can prevent that.

alter table "platform"."roles"
  add column "canEditAttendance" boolean,
  add column "canExportStars"    boolean,
  add column "canTriggerSync"    boolean;

-- ============================================================
-- resolvedUserPermissions
-- ============================================================
--
-- Materialized views cannot be replaced in place, so this is a drop and
-- rebuild. Everything the old definition carried has to come back with it --
-- the unique index CONCURRENTLY refreshes depend on, and the grants that the
-- schema's default privileges applied when it was first created. A rebuild
-- that silently drops either leaves a view that reads correctly in psql and
-- fails for every client.
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
    r."canTriggerSync"
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
    (array_agg(ucr."canTriggerSync" order by ucr.rank asc) filter (where ucr."canTriggerSync" is not null))[1] as "canTriggerSync"
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
  case when rh."userId" is not null then true else coalesce(fnn."isLeader", false) end as "isLeader",
  case when rh."userId" is not null then '-Infinity'::double precision else coalesce(fnn."minRank", 'Infinity'::double precision) end as "minRank"
from all_users au
left join root_holders rh on rh."userId" = au."userId"
left join first_non_null fnn on fnn."userId" = au."userId";

-- Required by `refresh materialized view concurrently`, which the trigger uses.
create unique index "resolvedUserPermissions_userId_idx"
  on "platform"."resolvedUserPermissions" ("userId");

grant all on "platform"."resolvedUserPermissions"
  to anon, authenticated, service_role;

refresh materialized view "platform"."resolvedUserPermissions";

-- ============================================================
-- Trigger column list
-- ============================================================
--
-- The roles trigger is narrowed to `update of (...)` so the Discord reconcile
-- loop's writes to "discordSyncedName"/"discordSyncedColor" do not refresh the
-- view for no reason. That narrowing is exactly why adding a permission column
-- is a two-part change: a column missing from this list is a column whose
-- edits never reach the snapshot, and the failure is silent -- the role looks
-- granted in the console and resolves as false everywhere it is checked.
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
          "canTriggerSync"
     or delete
     or truncate
     on "platform"."roles"
  for each statement
  execute function "platform".refresh_resolved_user_permissions();
