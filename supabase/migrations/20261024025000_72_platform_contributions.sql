SET local check_function_bodies = off;

CREATE TABLE "platform"."contributions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "repo"           text                     NOT NULL,
  "repoPrivate"    boolean                  NOT NULL DEFAULT false,
  "prNumber"       integer                  NOT NULL,
  "title"          text                     NOT NULL,
  "url"            text                     NOT NULL,
  "mergedAt"       timestamp with time zone NOT NULL,
  "authorGithubId" text                     NOT NULL,
  "authorLogin"    text                     NOT NULL,
  "userId"         uuid,
  "deliveryId"     text,
  "createdAt"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "contributions_deliveryId_key" UNIQUE ("deliveryId"),
  CONSTRAINT "contributions_pkey" PRIMARY KEY (id),
  CONSTRAINT "contributions_repo_prNumber_key" UNIQUE (repo, "prNumber")
);

ALTER TABLE "platform"."contributions"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform.claim_contributions()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- A member who links (or signs up with) GitHub takes the merged pull
  -- requests already recorded for that GitHub user id. By id, never by login.
  if new."provider" = 'github' then
    update "platform"."contributions" c
       set "userId" = new."user_id"
     where c."userId" is null
       and c."authorGithubId" = new."provider_id";
  end if;
  return new;
end;
$function$;

ALTER TABLE "platform"."contributions"
  ADD CONSTRAINT "contributions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "contributions_unmatched_authorGithubId_idx" ON platform.contributions USING btree ("authorGithubId")
  WHERE ("userId" IS NULL);

CREATE INDEX "contributions_userId_mergedAt_idx" ON platform.contributions USING btree ("userId", "mergedAt" DESC);

CREATE TRIGGER identities_claim_contributions
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION platform.claim_contributions();

CREATE POLICY "crud_public_policy_delete" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."contributions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "platform"."contributions" IS 'Server-only. One merged pull request in a DevDogs organization repository, fed by the GitHub App webhook and the backfill. "authorGithubId" is the author''s numeric GitHub user id (matched against auth.identities.provider_id, never the login). "userId" is the matched member, or null while the author has no linked GitHub account; platform.claim_contributions fills it when they link. Account deletion: the member''s rows are deleted with the account (ON DELETE CASCADE) because a member''s contribution history is personal data; rows with a null "userId" belong to no account and stay. "repoPrivate" rows count for the member (their own page, streaks) but are never shown on a public profile. Public reads go only through the public-profile loaders. Caveats: unique on (repo full name, PR number), so a repository rename or transfer makes a backfill record its PRs again under the new name; unlinking GitHub does not release a member''s rows.';

REVOKE ALL ON FUNCTION "platform"."claim_contributions"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."claim_contributions"() TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."contributions" TO "postgres", "service_role";

-- Default privileges grant anon and authenticated; these objects are server-only.
REVOKE ALL ON FUNCTION "platform"."claim_contributions"() FROM "anon";
REVOKE ALL ON FUNCTION "platform"."claim_contributions"() FROM "authenticated";
REVOKE ALL ON TABLE "platform"."contributions" FROM "anon";
REVOKE ALL ON TABLE "platform"."contributions" FROM "authenticated";
