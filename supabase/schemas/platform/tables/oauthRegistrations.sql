CREATE TABLE "platform"."oauthRegistrations" (
  "clientId" uuid NOT NULL,
  "userId"   uuid,
  "label"    text NOT NULL DEFAULT 'Default Client'::text,
  CONSTRAINT "oauthRegistrations_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "oauthRegistrations_pkey" PRIMARY KEY ("clientId"),
  CONSTRAINT "oauthRegistrations_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."oauthRegistrations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "type" platform."oauthRegistrationType" NOT NULL DEFAULT 'development'::platform."oauthRegistrationType";

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "tier" platform."oauthTier" NOT NULL DEFAULT 'development'::platform."oauthTier";

CREATE TRIGGER "oauthRegistrations_tier_immutable"
  BEFORE UPDATE OF tier ON platform."oauthRegistrations"
  FOR EACH ROW
  WHEN ((old.tier IS DISTINCT FROM new.tier))
  EXECUTE FUNCTION platform.reject_oauth_tier_change();

CREATE POLICY "crud_public_policy_delete" ON "platform"."oauthRegistrations"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."oauthRegistrations"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."oauthRegistrations"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."oauthRegistrations"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."oauthRegistrations" TO "anon", "authenticated", "postgres", "service_role";
