CREATE MATERIALIZED VIEW "resolvedUserPermissions" AS
WITH root_holders AS (
  SELECT ur."userId"
  FROM "userRoles" ur
  WHERE ur."roleId" = '00000000-0000-0000-0000-000000000002'::uuid
),
user_custom_roles AS (
  SELECT
    ur."userId",
    r.rank,
    r."isLeadership",
    r."canModerate",
    r."canManageRoles",
    r."canManageSuspensions",
    r."canViewAuditLog",
    r."canManageFeedback",
    r."canCreateCredentials",
    r."canManageVerification"
  FROM "userRoles" ur
  INNER JOIN roles r ON r.id = ur."roleId" AND r."roleType" = 'custom'
),
first_non_null AS (
  SELECT
    ucr."userId",
    MIN(ucr.rank) AS "minRank",
    BOOL_OR(ucr."isLeadership") AS "isLeader",
    (ARRAY_AGG(ucr."canModerate" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canModerate" IS NOT NULL))[1] AS "canModerate",
    (ARRAY_AGG(ucr."canManageRoles" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canManageRoles" IS NOT NULL))[1] AS "canManageRoles",
    (ARRAY_AGG(ucr."canManageSuspensions" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canManageSuspensions" IS NOT NULL))[1] AS "canManageSuspensions",
    (ARRAY_AGG(ucr."canViewAuditLog" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canViewAuditLog" IS NOT NULL))[1] AS "canViewAuditLog",
    (ARRAY_AGG(ucr."canManageFeedback" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canManageFeedback" IS NOT NULL))[1] AS "canManageFeedback",
    (ARRAY_AGG(ucr."canCreateCredentials" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canCreateCredentials" IS NOT NULL))[1] AS "canCreateCredentials",
    (ARRAY_AGG(ucr."canManageVerification" ORDER BY ucr.rank ASC) FILTER (WHERE ucr."canManageVerification" IS NOT NULL))[1] AS "canManageVerification"
  FROM user_custom_roles ucr
  GROUP BY ucr."userId"
),
all_users AS (
  SELECT DISTINCT "userId" FROM "userRoles"
)
SELECT
  au."userId",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canModerate", false) END AS "canModerate",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageRoles", false) END AS "canManageRoles",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageSuspensions", false) END AS "canManageSuspensions",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canViewAuditLog", false) END AS "canViewAuditLog",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageFeedback", false) END AS "canManageFeedback",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canCreateCredentials", false) END AS "canCreateCredentials",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."canManageVerification", false) END AS "canManageVerification",
  CASE WHEN rh."userId" IS NOT NULL THEN true ELSE COALESCE(fnn."isLeader", false) END AS "isLeader",
  CASE WHEN rh."userId" IS NOT NULL THEN '-Infinity'::double precision ELSE COALESCE(fnn."minRank", 'Infinity'::double precision) END AS "minRank"
FROM all_users au
LEFT JOIN root_holders rh ON rh."userId" = au."userId"
LEFT JOIN first_non_null fnn ON fnn."userId" = au."userId";

CREATE UNIQUE INDEX "resolvedUserPermissions_userId_idx"
  ON "resolvedUserPermissions" ("userId");

REFRESH MATERIALIZED VIEW "resolvedUserPermissions";
