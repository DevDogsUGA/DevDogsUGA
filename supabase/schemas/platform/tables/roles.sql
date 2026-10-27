CREATE TABLE "platform"."roles" (
  "id"                   uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "title"                character varying(64)       NOT NULL,
  "description"          text                        NOT NULL DEFAULT ''::text,
  "rank"                 double precision,
  "color"                character varying(7),
  "canModerate"          boolean,
  "canManageRoles"       boolean,
  "canManageSuspensions" boolean,
  "canViewAuditLog"      boolean,
  "createdAt"            timestamp without time zone NOT NULL DEFAULT now(),
  "showOnProfile"        boolean                     NOT NULL DEFAULT true,
  "isLeadership"         boolean                     NOT NULL DEFAULT false,
  "discordRoleId"        text,
  "discordSyncedName"    text,
  "discordSyncedColor"   integer,
  "canManageAttendance"  boolean,
  "canPreviewDocs"       boolean,
  "canManageOAuthApps"   boolean,
  "canDeleteAccounts"    boolean,
  CONSTRAINT "roles_discordRoleId_key" UNIQUE ("discordRoleId"),
  CONSTRAINT "roles_pkey" PRIMARY KEY (id),
  CONSTRAINT "roles_rank_key" UNIQUE (rank),
  CONSTRAINT "roles_title_key" UNIQUE (title)
);

ALTER TABLE "platform"."roles"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."roles"
  ADD COLUMN "roleType" platform."roleType" NOT NULL DEFAULT 'custom'::platform."roleType";

ALTER TABLE "platform"."roles"
  ADD CONSTRAINT "roles_custom_requires_rank" CHECK ((("roleType" = 'custom'::platform."roleType") = (rank IS NOT NULL)));

CREATE INDEX "roles_isLeadership_rank_idx" ON platform.roles USING btree (rank)
  WHERE "isLeadership";

CREATE TRIGGER roles_refresh_resolved_permissions
  AFTER INSERT OR DELETE OR UPDATE OF id,
    rank,
    "isLeadership", "roleType", "canModerate", "canManageRoles", "canManageSuspensions", "canViewAuditLog", "canManageAttendance", "canPreviewDocs", "canManageOAuthApps", "canDeleteAccounts" OR TRUNCATE ON platform.roles
  FOR EACH STATEMENT
  EXECUTE FUNCTION platform.refresh_resolved_user_permissions();

CREATE POLICY "crud_authenticated_policy_delete" ON "platform"."roles"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (false);

CREATE POLICY "crud_authenticated_policy_insert" ON "platform"."roles"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (false);

CREATE POLICY "crud_authenticated_policy_select" ON "platform"."roles"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "crud_authenticated_policy_update" ON "platform"."roles"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny_test_identities" ON "platform"."roles"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((NOT platform.is_test_identity(( SELECT auth.uid() AS uid))))
  WITH CHECK ((NOT platform.is_test_identity(( SELECT auth.uid() AS uid))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."roles" TO "anon", "authenticated", "postgres", "service_role";
