-- Hand-written to match the declarative roles and resolved permissions schemas.
DROP TRIGGER roles_refresh_resolved_permissions ON platform.roles;
DROP MATERIALIZED VIEW platform."resolvedUserPermissions";
ALTER TABLE platform.roles ADD COLUMN "canReviewProjectReports" boolean;

CREATE MATERIALIZED VIEW "platform"."resolvedUserPermissions"
  AS  WITH user_custom_roles AS (
         SELECT ur."userId",
            r.rank,
            r."isLeadership",
            r."canModerate",
            r."canManageRoles",
            r."canManageSuspensions",
            r."canViewAuditLog",
            r."canManageAttendance",
            r."canPreviewDocs",
            r."canManageOAuthApps",
            r."canDeleteAccounts",
            r."canReviewProjectReports"
           FROM (platform."userRoles" ur
             JOIN platform.roles r ON (((r.id = ur."roleId") AND (r."roleType" = 'custom'::platform."roleType"))))
        ), first_non_null AS (
         SELECT ucr."userId",
            min(ucr.rank) AS "minRank",
            bool_or(ucr."isLeadership") AS "isLeader",
            (array_agg(ucr."canModerate" ORDER BY ucr.rank) FILTER (WHERE (ucr."canModerate" IS NOT NULL)))[1] AS "canModerate",
            (array_agg(ucr."canManageRoles" ORDER BY ucr.rank) FILTER (WHERE (ucr."canManageRoles" IS NOT NULL)))[1] AS "canManageRoles",
            (array_agg(ucr."canManageSuspensions" ORDER BY ucr.rank) FILTER (WHERE (ucr."canManageSuspensions" IS NOT NULL)))[1] AS "canManageSuspensions",
            (array_agg(ucr."canViewAuditLog" ORDER BY ucr.rank) FILTER (WHERE (ucr."canViewAuditLog" IS NOT NULL)))[1] AS "canViewAuditLog",
            (array_agg(ucr."canManageAttendance" ORDER BY ucr.rank) FILTER (WHERE (ucr."canManageAttendance" IS NOT NULL)))[1] AS "canManageAttendance",
            (array_agg(ucr."canPreviewDocs" ORDER BY ucr.rank) FILTER (WHERE (ucr."canPreviewDocs" IS NOT NULL)))[1] AS "canPreviewDocs",
            (array_agg(ucr."canManageOAuthApps" ORDER BY ucr.rank) FILTER (WHERE (ucr."canManageOAuthApps" IS NOT NULL)))[1] AS "canManageOAuthApps",
            (array_agg(ucr."canDeleteAccounts" ORDER BY ucr.rank) FILTER (WHERE (ucr."canDeleteAccounts" IS NOT NULL)))[1] AS "canDeleteAccounts",
            (array_agg(ucr."canReviewProjectReports" ORDER BY ucr.rank) FILTER (WHERE (ucr."canReviewProjectReports" IS NOT NULL)))[1] AS "canReviewProjectReports"
           FROM user_custom_roles ucr
          GROUP BY ucr."userId"
        ), all_users AS (
         SELECT DISTINCT "userRoles"."userId"
           FROM platform."userRoles"
        )
 SELECT au."userId",
    COALESCE(fnn."canModerate", false) AS "canModerate",
    COALESCE(fnn."canManageRoles", false) AS "canManageRoles",
    COALESCE(fnn."canManageSuspensions", false) AS "canManageSuspensions",
    COALESCE(fnn."canViewAuditLog", false) AS "canViewAuditLog",
    COALESCE(fnn."canManageAttendance", false) AS "canManageAttendance",
    COALESCE(fnn."canPreviewDocs", false) AS "canPreviewDocs",
    COALESCE(fnn."canManageOAuthApps", false) AS "canManageOAuthApps",
    COALESCE(fnn."canDeleteAccounts", false) AS "canDeleteAccounts",
    COALESCE(fnn."canReviewProjectReports", false) AS "canReviewProjectReports",
    COALESCE(fnn."isLeader", false) AS "isLeader",
    COALESCE(fnn."minRank", 'Infinity'::double precision) AS "minRank"
   FROM (all_users au
     LEFT JOIN first_non_null fnn ON ((fnn."userId" = au."userId")));

CREATE UNIQUE INDEX "resolvedUserPermissions_userId_idx" ON platform."resolvedUserPermissions" USING btree ("userId");

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."resolvedUserPermissions" TO "anon", "authenticated", "postgres", "service_role";

CREATE TRIGGER roles_refresh_resolved_permissions
  AFTER INSERT OR DELETE OR UPDATE OF id,
    rank,
    "isLeadership", "roleType", "canModerate", "canManageRoles", "canManageSuspensions", "canViewAuditLog", "canManageAttendance", "canPreviewDocs", "canManageOAuthApps", "canDeleteAccounts", "canReviewProjectReports" OR TRUNCATE ON platform.roles
  FOR EACH STATEMENT
  EXECUTE FUNCTION platform.refresh_resolved_user_permissions();


-- President is the top-ranked custom role; Coordinator assignment is deferred.
UPDATE platform.roles SET "canReviewProjectReports" = true WHERE "roleType" = 'custom' AND rank = 100;
REFRESH MATERIALIZED VIEW platform."resolvedUserPermissions";
