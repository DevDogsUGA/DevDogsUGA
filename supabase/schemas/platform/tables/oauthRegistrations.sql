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

-- The publishing status (oauth-consent Q154a). "tier" above is retired: nothing
-- reads it any more and the immutability trigger is gone. The column and the
-- "oauthTier" type are dropped in a later, destructive change, one deploy after
-- the last reader (see the notes in migration 57).
ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "status" platform."oauthStatus" NOT NULL DEFAULT 'testing'::platform."oauthStatus";

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "asksForConsent" boolean NOT NULL DEFAULT true;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "logoPath" text;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "homepageUrl" text;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "privacyPolicyUrl" text;

-- Only a DevDogs app (no owner) that is In production may skip the consent
-- screen (Q162). Anything else always asks.
ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_consent_skip_check" CHECK (("asksForConsent" OR (("userId" IS NULL) AND (status = 'in_production'::platform."oauthStatus"))));

-- https only, no credentials in the address (Q159). The app's own pages, so a
-- plain string compare is enough; the form checks again when it saves.
ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_homepageUrl_https" CHECK ((("homepageUrl" IS NULL) OR (("homepageUrl" ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'::text) AND (char_length("homepageUrl") <= 2048))));

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_privacyPolicyUrl_https" CHECK ((("privacyPolicyUrl" IS NULL) OR (("privacyPolicyUrl" ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'::text) AND (char_length("privacyPolicyUrl") <= 2048))));

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_logoPath_length" CHECK ((("logoPath" IS NULL) OR (char_length("logoPath") <= 512)));

-- A member owns at most three OAuth apps (Q163), Testing or In production.
CREATE TRIGGER "oauthRegistrations_app_cap"
  BEFORE INSERT OR UPDATE OF "userId" ON platform."oauthRegistrations"
  FOR EACH ROW
  EXECUTE FUNCTION platform.enforce_oauth_app_cap();

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
