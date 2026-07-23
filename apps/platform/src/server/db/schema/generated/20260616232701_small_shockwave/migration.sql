-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "contentAction" AS ENUM('quarantine', 'no_action');--> statement-breakpoint
CREATE TYPE "credentialType" AS ENUM('email_password', 'totp', 'email_password_totp');--> statement-breakpoint
CREATE TYPE "feedbackSeverity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "feedbackStatus" AS ENUM('open', 'in_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "feedbackType" AS ENUM('bug_report', 'feature_request', 'design_feedback', 'performance', 'content_issue', 'other');--> statement-breakpoint
CREATE TYPE "filerAction" AS ENUM('warn', 'suspend', 'no_action');--> statement-breakpoint
CREATE TYPE "graduationSemester" AS ENUM('spring', 'summer', 'fall');--> statement-breakpoint
CREATE TYPE "oauthRegistrationType" AS ENUM('development', 'production');--> statement-breakpoint
CREATE TYPE "reportReason" AS ENUM('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other');--> statement-breakpoint
CREATE TYPE "reportStatus" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "roleType" AS ENUM('default', 'root', 'custom');--> statement-breakpoint
CREATE TYPE "subjectAction" AS ENUM('warn', 'suspend', 'ban', 'no_action');--> statement-breakpoint
CREATE TABLE "contentReports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"clientId" uuid NOT NULL,
	"reporterUserId" uuid NOT NULL,
	"reportedUserId" uuid NOT NULL,
	"contentId" text NOT NULL,
	"contentType" varchar(64),
	"contentSnapshot" varchar(5000) NOT NULL,
	"contentUrl" text,
	"reason" "reportReason" NOT NULL,
	"description" varchar(1000),
	"status" "reportStatus" DEFAULT 'pending'::"reportStatus" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "contentReports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credentialRoles" (
	"credentialId" uuid,
	"roleId" uuid,
	CONSTRAINT "credentialRoles_pkey" PRIMARY KEY("credentialId","roleId")
);
--> statement-breakpoint
ALTER TABLE "credentialRoles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"type" "credentialType" NOT NULL,
	"email" text,
	"passwordSecretId" uuid,
	"totpSecretId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" uuid
);
--> statement-breakpoint
ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedbackTopics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"clientId" uuid NOT NULL,
	"label" varchar(50) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedbackTopics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaderboardProfiles" (
	"githubId" varchar(255) PRIMARY KEY,
	"githubLogin" varchar(255) NOT NULL CONSTRAINT "leaderboardProfiles_githubLogin_key" UNIQUE,
	"avatarUrl" text,
	"allTimePoints" integer DEFAULT 0 NOT NULL,
	"allTimeRanking" integer,
	"currentYearPoints" integer DEFAULT 0 NOT NULL,
	"currentYearRanking" integer
);
--> statement-breakpoint
ALTER TABLE "leaderboardProfiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderatorRoles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"clientId" uuid NOT NULL,
	"grantedByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderatorRoles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthRegistrations" (
	"clientId" uuid PRIMARY KEY,
	"userId" uuid NOT NULL CONSTRAINT "oauthRegistrations_userId_key" UNIQUE,
	"type" "oauthRegistrationType" DEFAULT 'development'::"oauthRegistrationType" NOT NULL,
	"reportApiKeyHash" text,
	"reportWebhookUrl" text,
	"reportWebhookSecretId" uuid
);
--> statement-breakpoint
ALTER TABLE "oauthRegistrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauthTestAccounts" (
	"testUserId" uuid PRIMARY KEY,
	"ownerUserId" uuid NOT NULL CONSTRAINT "oauthTestAccounts_ownerUserId_key" UNIQUE,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauthTestAccounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "points" (
	"leaderboardProfileId" varchar(255),
	"year" integer,
	"streakStart" date NOT NULL,
	"streakLength" integer DEFAULT 0 NOT NULL,
	"longestStreakLength" integer DEFAULT 0 NOT NULL,
	"projectPoints" integer DEFAULT 0 NOT NULL,
	"streakBonusPoints" integer DEFAULT 0 NOT NULL,
	"academyPoints" integer DEFAULT 0 NOT NULL,
	"points" integer GENERATED ALWAYS AS ((("projectPoints" + "streakBonusPoints") + "academyPoints")) STORED NOT NULL,
	CONSTRAINT "points_pkey" PRIMARY KEY("leaderboardProfileId","year")
);
--> statement-breakpoint
ALTER TABLE "points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profile" (
	"userId" uuid PRIMARY KEY,
	"preferredName" varchar(255) NOT NULL,
	"bio" varchar(127),
	"pronouns" text[],
	"graduationSemester" "graduationSemester",
	"graduationYear" integer,
	"showGithub" boolean DEFAULT false NOT NULL,
	"showDiscord" boolean DEFAULT false NOT NULL,
	"showEmail" boolean DEFAULT false NOT NULL,
	"showLinkedin" boolean DEFAULT false NOT NULL,
	"viewedConsole" boolean DEFAULT false NOT NULL,
	"involvementFirstName" text,
	"involvementLastName" text,
	"involvementImportedAt" timestamp,
	"roleDescription" varchar(127)
);
--> statement-breakpoint
ALTER TABLE "profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profileLinks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"url" text NOT NULL,
	"title" varchar(64) NOT NULL,
	"sortOrder" double precision DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "profileLinks_userId_sortOrder_key" UNIQUE("userId","sortOrder")
);
--> statement-breakpoint
ALTER TABLE "profileLinks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reportCorroborations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reportId" uuid NOT NULL,
	"reporterUserId" uuid NOT NULL,
	"reason" "reportReason" NOT NULL,
	"description" varchar(1000),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reportCorroborations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reportResolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reportId" uuid NOT NULL CONSTRAINT "reportResolutions_reportId_key" UNIQUE,
	"moderatorUserId" uuid NOT NULL,
	"subjectAction" "subjectAction" NOT NULL,
	"filerAction" "filerAction" NOT NULL,
	"contentAction" "contentAction" NOT NULL,
	"appliedGlobally" boolean DEFAULT false NOT NULL,
	"moderatorNote" text,
	"webhookAttempts" integer DEFAULT 0 NOT NULL,
	"nextRetryAt" timestamp,
	"notifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reportResolutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" varchar(64) NOT NULL CONSTRAINT "roles_title_key" UNIQUE,
	"description" text DEFAULT '' NOT NULL,
	"rank" double precision CONSTRAINT "roles_rank_key" UNIQUE,
	"color" varchar(7),
	"canModerate" boolean,
	"canManageRoles" boolean,
	"canManageSuspensions" boolean,
	"canViewAuditLog" boolean,
	"canManageFeedback" boolean,
	"canCreateCredentials" boolean,
	"canManageVerification" boolean,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"roleType" "roleType" DEFAULT 'custom'::"roleType" NOT NULL,
	"showOnProfile" boolean DEFAULT true NOT NULL,
	"isLeadership" boolean DEFAULT false NOT NULL,
	"discordRoleId" text CONSTRAINT "roles_discordRoleId_key" UNIQUE,
	"discordSyncedName" text,
	"discordSyncedColor" integer,
	CONSTRAINT "roles_custom_requires_rank" CHECK ((("roleType" = 'custom'::"roleType") = (rank IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "siteFeedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"type" "feedbackType" NOT NULL,
	"topic" varchar(50) NOT NULL,
	"severity" "feedbackSeverity",
	"title" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"status" "feedbackStatus" DEFAULT 'open'::"feedbackStatus" NOT NULL,
	"browserMetadata" jsonb,
	"attachmentPaths" text[],
	"adminNote" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"clientId" uuid
);
--> statement-breakpoint
ALTER TABLE "siteFeedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "userRoles" (
	"userId" uuid,
	"roleId" uuid,
	CONSTRAINT "userRoles_pkey" PRIMARY KEY("userId","roleId")
);
--> statement-breakpoint
ALTER TABLE "userRoles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "userSuspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"service" text NOT NULL,
	"reason" text,
	"suspendedAt" timestamp DEFAULT now() NOT NULL,
	"suspendedBy" uuid
);
--> statement-breakpoint
ALTER TABLE "userSuspensions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "feedbackTopics_client_label_idx" ON "feedbackTopics" ("clientId","label");--> statement-breakpoint
CREATE UNIQUE INDEX "login_idx" ON "leaderboardProfiles" (lower(("githubLogin")::text));--> statement-breakpoint
CREATE UNIQUE INDEX "moderatorRoles_user_client_idx" ON "moderatorRoles" ("userId","clientId");--> statement-breakpoint
CREATE UNIQUE INDEX "reportCorroborations_report_reporter_idx" ON "reportCorroborations" ("reportId","reporterUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "userRoles_root_singleton" ON "userRoles" ("roleId") WHERE ("roleId" = '00000000-0000-0000-0000-000000000002'::uuid);--> statement-breakpoint
CREATE UNIQUE INDEX "userSuspensions_user_service_idx" ON "userSuspensions" ("userId","service");--> statement-breakpoint
ALTER TABLE "contentReports" ADD CONSTRAINT "contentReports_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contentReports" ADD CONSTRAINT "contentReports_reportedUserId_users_id_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contentReports" ADD CONSTRAINT "contentReports_reporterUserId_users_id_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentialRoles" ADD CONSTRAINT "credentialRoles_credentialId_credentials_id_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentialRoles" ADD CONSTRAINT "credentialRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "feedbackTopics" ADD CONSTRAINT "feedbackTopics_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "moderatorRoles" ADD CONSTRAINT "moderatorRoles_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "moderatorRoles" ADD CONSTRAINT "moderatorRoles_grantedByUserId_users_id_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "moderatorRoles" ADD CONSTRAINT "moderatorRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauthRegistrations" ADD CONSTRAINT "oauthRegistrations_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES "auth"."oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "oauthRegistrations" ADD CONSTRAINT "oauthRegistrations_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "oauthTestAccounts" ADD CONSTRAINT "oauthTestAccounts_ownerUserId_users_id_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "oauthTestAccounts" ADD CONSTRAINT "oauthTestAccounts_testUserId_users_id_fkey" FOREIGN KEY ("testUserId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey" FOREIGN KEY ("leaderboardProfileId") REFERENCES "leaderboardProfiles"("githubId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "profileLinks" ADD CONSTRAINT "profileLinks_userId_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "reportCorroborations" ADD CONSTRAINT "reportCorroborations_reporterUserId_users_id_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reportCorroborations" ADD CONSTRAINT "reportCorroborations_reportId_contentReports_id_fkey" FOREIGN KEY ("reportId") REFERENCES "contentReports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reportResolutions" ADD CONSTRAINT "reportResolutions_moderatorUserId_users_id_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "reportResolutions" ADD CONSTRAINT "reportResolutions_reportId_contentReports_id_fkey" FOREIGN KEY ("reportId") REFERENCES "contentReports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "siteFeedback" ADD CONSTRAINT "siteFeedback_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES "auth"."oauth_clients"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "siteFeedback" ADD CONSTRAINT "siteFeedback_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "userRoles" ADD CONSTRAINT "userRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "userRoles" ADD CONSTRAINT "userRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "userSuspensions" ADD CONSTRAINT "userSuspensions_suspendedBy_users_id_fkey" FOREIGN KEY ("suspendedBy") REFERENCES "auth"."users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "userSuspensions" ADD CONSTRAINT "userSuspensions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE VIEW "profileWithVerification" WITH (security_invoker = true) AS (SELECT "userId", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AS "hasPronouns", "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AS "hasGraduationDate", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AS "hasGithub", (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS "hasDiscord", "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AS "nameMatchesInvolvement", pronouns IS NOT NULL AND array_length(pronouns, 1) > 0 AND "graduationSemester" IS NOT NULL AND "graduationYear" IS NOT NULL AND "involvementFirstName" IS NOT NULL AND lower(TRIM(BOTH FROM "preferredName")) = lower((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'github'::text)) AND (EXISTS ( SELECT 1 FROM auth.identities i WHERE i.user_id = p."userId" AND i.provider = 'discord'::text)) AS verified FROM profile p);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "contentReports" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "contentReports" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "contentReports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((( SELECT auth.uid() AS uid) = "reporterUserId") OR (EXISTS ( SELECT 1
   FROM "moderatorRoles" mr
  WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = "contentReports"."clientId"))))));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "contentReports" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "credentialRoles" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "credentialRoles" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "credentialRoles" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "credentialRoles" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "credentials" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "credentials" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "credentials" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "credentials" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "feedbackTopics" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "feedbackTopics" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "feedbackTopics" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "feedbackTopics" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "leaderboardProfiles" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "leaderboardProfiles" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "leaderboardProfiles" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "leaderboardProfiles" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "moderatorRoles" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "moderatorRoles" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "moderatorRoles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "moderatorRoles" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "oauthRegistrations" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "oauthRegistrations" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "oauthRegistrations" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "oauthRegistrations" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "oauthTestAccounts" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "oauthTestAccounts" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "oauthTestAccounts" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "oauthTestAccounts" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "points" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "points" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "points" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "points" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "profile" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "profile" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "profile" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "profile" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId")) WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "profileLinks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "profileLinks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "profileLinks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "profileLinks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = "userId")) WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "reportCorroborations" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "reportCorroborations" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "reportCorroborations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("contentReports" cr
     JOIN "moderatorRoles" mr ON ((mr."clientId" = cr."clientId")))
  WHERE ((cr.id = "reportCorroborations"."reportId") AND (mr."userId" = ( SELECT auth.uid() AS uid))))));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "reportCorroborations" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "reportResolutions" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "reportResolutions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "reportResolutions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "contentReports" cr
  WHERE ((cr.id = "reportResolutions"."reportId") AND ((cr."reporterUserId" = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM "moderatorRoles" mr
          WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = cr."clientId")))))))));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "reportResolutions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "roles" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "roles" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "roles" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_delete" ON "siteFeedback" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_insert" ON "siteFeedback" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_select" ON "siteFeedback" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((( SELECT auth.uid() AS uid) = "userId") OR (EXISTS ( SELECT 1
   FROM ("userRoles" ur
     JOIN roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true))))));--> statement-breakpoint
CREATE POLICY "crud_authenticated_policy_update" ON "siteFeedback" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("userRoles" ur
     JOIN roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("userRoles" ur
     JOIN roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true)))));--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "userRoles" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "userRoles" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "userRoles" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "userRoles" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_delete" ON "userSuspensions" AS RESTRICTIVE FOR DELETE TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_insert" ON "userSuspensions" AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_select" ON "userSuspensions" AS RESTRICTIVE FOR SELECT TO public USING (false);--> statement-breakpoint
CREATE POLICY "crud_public_policy_update" ON "userSuspensions" AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false);
*/