SET local check_function_bodies = off;

DROP TRIGGER "roles_refresh_resolved_permissions" ON "platform"."roles";

DROP MATERIALIZED VIEW "platform"."resolvedUserPermissions";

DROP VIEW "platform"."publicProfiles";

CREATE TABLE "platform"."accountDeletions" (
  "userId"        uuid                     NOT NULL,
  "scheduledFor"  timestamp with time zone NOT NULL,
  "requestedBy"   uuid,
  "reason"        text,
  "email"         text                     NOT NULL,
  "name"          text,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  "attempts"      integer                  NOT NULL DEFAULT 0,
  "lastAttemptAt" timestamp with time zone,
  "lastError"     text,
  CONSTRAINT "accountDeletions_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "platform"."accountDeletions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."roles"
  ADD COLUMN "canDeleteAccounts" boolean;

CREATE OR REPLACE FUNCTION platform.enqueue_user_standing (
  p_user     uuid,
  p_action   text,
  p_reason   text,
  p_report   uuid DEFAULT NULL::uuid,
  p_only_app uuid DEFAULT NULL::uuid
)
  RETURNS uuid[]
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  ids uuid[] := '{}';
  app record;
begin
  if p_action not in ('suspend', 'ban', 'restore', 'delete') then
    raise exception 'Unknown user standing action "%"', p_action;
  end if;

  for app in
    select a."id"
    from "platform"."apps" a
    where a."kind" = 'external'
      and (p_only_app is null or a."id" = p_only_app)
    order by a."slug"
  loop
    ids := ids || "platform".enqueue_moderation_delivery(
      app."id",
      'user.' || p_action,
      jsonb_build_object('userId', p_user, 'reason', p_reason, 'reportId', p_report),
      p_report
    );
  end loop;

  return ids;
end;
$function$;

ALTER TABLE "platform"."accountDeletions"
  ADD CONSTRAINT "accountDeletions_requestedBy_users_id_fkey" FOREIGN KEY ("requestedBy") REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE VIEW "platform"."publicProfiles" AS  SELECT p."userId",
    p.handle,
        CASE
            WHEN p."showName" THEN p."preferredName"
            ELSE NULL::character varying
        END AS "displayName",
    (p."showAvatar" AND (EXISTS ( SELECT 1
           FROM storage.objects o
          WHERE ((o.bucket_id = 'avatars'::text) AND (o.name = (p."userId")::text))))) AS "hasAvatar",
        CASE
            WHEN p."showBio" THEN p.bio
            ELSE NULL::character varying
        END AS bio,
        CASE
            WHEN p."showBio" THEN p."roleDescription"
            ELSE NULL::character varying
        END AS "roleDescription",
        CASE
            WHEN p."showGithub" THEN ( SELECT lower((i.identity_data ->> 'user_name'::text)) AS lower
               FROM auth.identities i
              WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))
            ELSE NULL::text
        END AS "githubHandle",
        CASE
            WHEN p."showDiscord" THEN ( SELECT (i.identity_data ->> 'full_name'::text)
               FROM auth.identities i
              WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text)))
            ELSE NULL::text
        END AS "discordHandle",
        CASE
            WHEN p."showLinkedin" THEN ( SELECT (i.identity_data ->> 'name'::text)
               FROM auth.identities i
              WHERE ((i.user_id = p."userId") AND (i.provider = 'linkedin_oidc'::text)))
            ELSE NULL::text
        END AS "linkedinName",
    p."showName",
    p."showAvatar",
    p."showBio",
    p."showLinks",
    p."showCompetitions",
    p."showContributions",
    p."showStars"
   FROM (platform.profile p
     JOIN platform."profileWithVerification" v ON ((v."userId" = p."userId")))
  WHERE (v.verified AND p."publicProfile" AND (p.handle IS NOT NULL) AND (p."quarantinedBy" IS NULL) AND (NOT platform.is_suspended(p."userId")) AND (NOT (EXISTS ( SELECT 1
           FROM platform."accountDeletions" d
          WHERE (d."userId" = p."userId")))));

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
            r."canDeleteAccounts"
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
            (array_agg(ucr."canDeleteAccounts" ORDER BY ucr.rank) FILTER (WHERE (ucr."canDeleteAccounts" IS NOT NULL)))[1] AS "canDeleteAccounts"
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
    COALESCE(fnn."isLeader", false) AS "isLeader",
    COALESCE(fnn."minRank", 'Infinity'::double precision) AS "minRank"
   FROM (all_users au
     LEFT JOIN first_non_null fnn ON ((fnn."userId" = au."userId")));

CREATE INDEX "accountDeletions_scheduledFor_idx" ON platform."accountDeletions" USING btree ("scheduledFor");

CREATE UNIQUE INDEX "resolvedUserPermissions_userId_idx" ON platform."resolvedUserPermissions" USING btree ("userId");

CREATE TRIGGER roles_refresh_resolved_permissions
  AFTER INSERT OR DELETE OR UPDATE OF id,
    rank,
    "isLeadership",
    "roleType",
    "canModerate",
    "canManageRoles", "canManageSuspensions", "canViewAuditLog", "canManageAttendance", "canPreviewDocs", "canManageOAuthApps", "canDeleteAccounts" OR TRUNCATE ON platform.roles
  FOR EACH STATEMENT
  EXECUTE FUNCTION platform.refresh_resolved_user_permissions();

CREATE POLICY "crud_public_policy_delete" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."accountDeletions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "platform"."accountDeletions" IS 'Server-only. A member''s scheduled account deletion (14-day window). "userId" has no foreign key on purpose: the deletion job removes the auth user partway through, and the row must outlive it so a failed later step (audit event, email) is retried; the job deletes the row last. A cancelled deletion deletes it too. "requestedBy" is the officer who scheduled it (null or equal to the member for a self-requested one); it is nulled if that officer is deleted. "email" and "name" are kept only so the completion email can be sent after the member is gone. Account deletion: this table is the deletion, nothing else holds a member through it.';

COMMENT ON VIEW "platform"."publicProfiles" IS 'The one definition of a public member profile. Server-only (no anon/authenticated grant). Hidden fields are NULL. Never add legal/involvement names, emails or attendance.';

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."resolvedUserPermissions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."accountDeletions" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."publicProfiles" TO "postgres", "service_role";

-- Server-only objects: the shadow database's default privileges grant anon and authenticated on new relations.
REVOKE ALL ON TABLE "platform"."accountDeletions" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "platform"."publicProfiles" FROM "anon", "authenticated";

-- Data step: President and DevOps Director get canDeleteAccounts, by their
-- fixed ids (as migration 57 did for canManageOAuthApps). Seeds are
-- insert-only, so a database that already has the roles needs the grant here.
-- The update fires the roles trigger, which refreshes the permissions snapshot.
update "platform"."roles"
set "canDeleteAccounts" = true
where "id" in (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-4000-8000-000000000003'
);
