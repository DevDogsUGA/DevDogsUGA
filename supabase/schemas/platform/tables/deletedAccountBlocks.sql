CREATE TABLE "platform"."deletedAccountBlocks" (
  "subjectHash" bytea                    NOT NULL,
  "expiresAt"   timestamp with time zone,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "deletedAccountBlocks_pkey" PRIMARY KEY ("subjectHash")
);

ALTER TABLE "platform"."deletedAccountBlocks"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_public_policy_delete" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."deletedAccountBlocks"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."deletedAccountBlocks" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."deletedAccountBlocks" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."deletedAccountBlocks" IS 'Server-only. A member who deleted their account during a suspension or ban: the keyed hash of their UGA subject (platform.deleted_account_hash) and when the block lifts (null = never). The before-user-created hook refuses a sign-up whose subject matches an unexpired row, so deleting an account is not a way out of a moderation action.';
