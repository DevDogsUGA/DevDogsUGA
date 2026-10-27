SET local check_function_bodies = off;

DROP TRIGGER "oauthRegistrations_tier_immutable" ON "platform"."oauthRegistrations";

DROP FUNCTION "platform"."moderation_client_tier"(uuid);

DROP FUNCTION "platform"."reject_oauth_tier_change"();

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "asksForConsent" boolean NOT NULL DEFAULT true;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "logoPath" text;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "homepageUrl" text;

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "privacyPolicyUrl" text;

CREATE TYPE "platform"."oauthStatus" AS ENUM (
  'testing',
  'in_production'
);

ALTER TABLE "platform"."oauthRegistrations"
  ADD COLUMN "status" platform."oauthStatus" NOT NULL DEFAULT 'testing'::platform."oauthStatus";

CREATE OR REPLACE FUNCTION platform.check_oauth_redirects()
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  bad record;
begin
  -- GoTrue stores a client's redirect URIs as one comma-separated string. A
  -- registered, live client with an address the redirect rule refuses fails the
  -- migration that runs this, loudly, with the client and the address.
  select r."clientId" as client_id, trim(u.uri) as uri
    into bad
    from "platform"."oauthRegistrations" r
    join "auth"."oauth_clients" c on c.id = r."clientId" and c.deleted_at is null
    cross join lateral unnest(string_to_array(c.redirect_uris, ',')) as u(uri)
   where not "platform".oauth_redirect_is_valid(trim(u.uri))
   limit 1;
  if found then
    raise exception 'OAuth client % has a redirect URI the redirect rule refuses: %',
      bad.client_id, bad.uri
      using errcode = '23514';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.enforce_oauth_app_cap()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- DevDogs apps have no owner and never count; a transfer frees a slot.
  if new."userId" is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old."userId" is not distinct from new."userId" then
    return new;
  end if;

  -- Two apps registered at the same moment must not both see room for one.
  perform pg_advisory_xact_lock(
    hashtextextended('platform.oauthRegistrations.cap:' || new."userId"::text, 0)
  );

  if (
    select count(*) from "platform"."oauthRegistrations" r
    where r."userId" = new."userId" and r."clientId" <> new."clientId"
  ) >= 3 then
    raise exception 'a member can own at most 3 OAuth apps'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.moderation_client_tier (
  p_client_id uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The moderation API still speaks in tiers: 'production' for an app that is
  -- In production, 'development' for one in Testing, null for a client nobody
  -- registered. The answer comes from the publishing status; the retired "tier"
  -- column is not read.
  select case r.status
           when 'in_production'::platform."oauthStatus" then 'production'
           else 'development'
         end
    from "platform"."oauthRegistrations" r
   where r."clientId" = p_client_id;
$function$;

CREATE OR REPLACE FUNCTION platform.oauth_redirect_is_valid (
  uri text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The one redirect rule for every OAuth client (oauth-consent, "Already
  -- settled"): http only for localhost, 127.0.0.1 and [::1] (any port, any
  -- path); https for everything else; no custom schemes; no credentials in the
  -- address. apps/platform/src/server/oauth/redirectRule.ts holds the same two
  -- patterns, and redirectRule.db-test.ts pins the pair to one corpus.
  select uri is not null
    and char_length(uri) <= 2048
    and (
      uri ~* '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      or uri ~* '^https://[^/?#@:[:space:]]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    );
$function$;

CREATE OR REPLACE FUNCTION platform.oauth_refuses_user (
  p_client uuid,
  p_user   uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Published apps never sign in test accounts (oauth-consent Q164): on an app
  -- that is In production everyone signs in as themselves, owner included.
  -- platform.is_test_identity(uid) answers the global question; this is the
  -- per-app one, shared by the consent decision and the access-token hook.
  select platform.is_test_identity(p_user)
     and exists (
       select 1 from "platform"."oauthRegistrations" r
        where r."clientId" = p_client
          and r.status = 'in_production'::platform."oauthStatus"
     );
$function$;

CREATE OR REPLACE FUNCTION platform.oauth_revoke_app_access (
  p_client uuid,
  p_scope  text,
  p_user   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  owner_id uuid;
  consents integer;
  sessions integer;
  authorizations integer;
begin
  -- The kill switch (oauth-consent Q156). One function for every caller, so the
  -- three auth tables it touches change together and in one transaction:
  --
  --   everyone_but_owner  back to Testing: every member except the owner and
  --                       the owner's test accounts (everyone, for a DevDogs
  --                       app, which has no owner)
  --   test_identities     publishing (Q164): every test account
  --   user                Forget approval and Remove access (Q158): p_user only
  --
  -- It ends what the app holds, in three steps:
  --   1. auth.oauth_consents.revoked_at is set (the approval is forgotten);
  --   2. the app's auth.sessions are deleted (oauth_client_id), and the refresh
  --      tokens go with them (auth.refresh_tokens.session_id cascades);
  --   3. pending auth.oauth_authorizations are deleted (a pending row may not
  --      have a user yet, so those go for every scope but "user").
  -- Access tokens already issued live out their hour with the oauth_identity
  -- role, which no table grants anything to. The columns used here are pinned by
  -- oauthRevokeAppAccess.db-test.ts, so a Supabase rename fails a test.
  if p_scope not in ('everyone_but_owner', 'test_identities', 'user') then
    raise exception 'unknown scope: %', p_scope using errcode = '22023';
  end if;
  if p_scope = 'user' and p_user is null then
    raise exception 'scope "user" needs a user' using errcode = '22023';
  end if;

  select r."userId" into owner_id
    from "platform"."oauthRegistrations" r where r."clientId" = p_client;
  if not found then
    raise exception 'no such OAuth app: %', p_client using errcode = 'P0002';
  end if;

  update "auth"."oauth_consents" c
     set revoked_at = greatest(now(), c.granted_at)
   where c.client_id = p_client
     and c.revoked_at is null
     and case p_scope
           when 'user' then c.user_id = p_user
           when 'test_identities' then exists (
             select 1 from "platform"."oauthTestAccounts" t
              where t."testUserId" = c.user_id)
           else c.user_id is distinct from owner_id
                and not exists (
                  select 1 from "platform"."oauthTestAccounts" t
                   where t."testUserId" = c.user_id
                     and t."ownerUserId" = owner_id)
         end;
  get diagnostics consents = row_count;

  delete from "auth"."sessions" s
   where s.oauth_client_id = p_client
     and case p_scope
           when 'user' then s.user_id = p_user
           when 'test_identities' then exists (
             select 1 from "platform"."oauthTestAccounts" t
              where t."testUserId" = s.user_id)
           else s.user_id is distinct from owner_id
                and not exists (
                  select 1 from "platform"."oauthTestAccounts" t
                   where t."testUserId" = s.user_id
                     and t."ownerUserId" = owner_id)
         end;
  get diagnostics sessions = row_count;

  delete from "auth"."oauth_authorizations" a
   where a.client_id = p_client
     and a.status = 'pending'
     and case p_scope
           when 'user' then a.user_id = p_user
           when 'test_identities' then a.user_id is null or exists (
             select 1 from "platform"."oauthTestAccounts" t
              where t."testUserId" = a.user_id)
           else a.user_id is null
                or (a.user_id is distinct from owner_id
                    and not exists (
                      select 1 from "platform"."oauthTestAccounts" t
                       where t."testUserId" = a.user_id
                         and t."ownerUserId" = owner_id))
         end;
  get diagnostics authorizations = row_count;

  return jsonb_build_object(
    'consents', consents,
    'sessions', sessions,
    'authorizations', authorizations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform.restrict_oauth_tokens (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  claims jsonb := event -> 'claims';
  client_id uuid;
  user_id uuid := nullif(event ->> 'user_id', '')::uuid;
begin
  -- GoTrue puts `client_id` on tokens it issues to OAuth clients. The session
  -- row records the same client, so check it too: either one marks the token
  -- as an OAuth client's, and a token without either is a first-party one.
  client_id := nullif(claims ->> 'client_id', '')::uuid;

  if client_id is null then
    select s.oauth_client_id
      into client_id
      from auth.sessions s
     where s.id = nullif(claims ->> 'session_id', '')::uuid;
  end if;

  if client_id is null then
    return jsonb_build_object('claims', claims);
  end if;

  -- A published app never signs in a test account (oauth-consent Q164). The
  -- consent page refuses them first; this is the backstop for GoTrue's own
  -- consent endpoint, which accepts any signed-in user's session.
  if user_id is not null and "platform".oauth_refuses_user(client_id, user_id) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Test accounts cannot sign in to a published app'
      )
    );
  end if;

  -- Whoever the client is, and whoever signed in, the token is an identity and
  -- nothing else: `oauth_identity` has no grants on any schema.
  return jsonb_build_object(
    'claims', jsonb_set(claims, '{role}', '"oauth_identity"')
  );
end;
$function$;

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_consent_skip_check" CHECK (("asksForConsent" OR (("userId" IS NULL) AND (status = 'in_production'::platform."oauthStatus"))));

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_homepageUrl_https"
    CHECK ((("homepageUrl" IS NULL) OR (("homepageUrl" ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'::text) AND (char_length("homepageUrl") <= 2048))));

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_logoPath_length" CHECK ((("logoPath" IS NULL) OR (char_length("logoPath") <= 512)));

ALTER TABLE "platform"."oauthRegistrations"
  ADD CONSTRAINT "oauthRegistrations_privacyPolicyUrl_https"
    CHECK ((("privacyPolicyUrl" IS NULL) OR (("privacyPolicyUrl" ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'::text) AND (char_length("privacyPolicyUrl") <= 2048))));

CREATE TRIGGER "oauthRegistrations_app_cap"
  BEFORE INSERT OR UPDATE OF "userId" ON platform."oauthRegistrations"
  FOR EACH ROW
  EXECUTE FUNCTION platform.enforce_oauth_app_cap();

REVOKE ALL ON FUNCTION "platform"."check_oauth_redirects"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."check_oauth_redirects"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."enforce_oauth_app_cap"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."enforce_oauth_app_cap"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."moderation_client_tier"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."moderation_client_tier"(uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."oauth_redirect_is_valid"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."oauth_redirect_is_valid"(text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."oauth_refuses_user"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."oauth_refuses_user"(uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."oauth_revoke_app_access"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."oauth_revoke_app_access"(uuid, text, uuid) TO "postgres", "service_role";

GRANT USAGE ON TYPE "platform"."oauthStatus" TO "postgres";

-- Stage E1 data step, appended by the Migration phase after the generated
-- schema migration (the generator can express the new columns, not this).
--
-- oauth-consent Q163. The tier column is retired: status and ownership replace
-- it, and nothing reads it any more. Idempotent: a second run changes nothing.

-- Development clients: Testing, consent on. (Their column defaults already say
-- so; this makes it explicit for rows that existed before the columns.)
update platform."oauthRegistrations"
   set status = 'testing',
       "asksForConsent" = true
 where tier = 'development';

-- Production clients (DogDays, DogPack) are DevDogs apps: no owner (A1 already
-- nulled it; repeated here so the consent check below cannot trip), In
-- production, consent skipped.
update platform."oauthRegistrations"
   set status = 'in_production',
       "userId" = null,
       "asksForConsent" = false
 where tier = 'production';

-- Their details (Q159, Q163). Logos come later, uploaded by `deploy avatars`.
-- Matched on the label the clients were registered under; any production
-- client that matches neither is reported below.
update platform."oauthRegistrations"
   set "homepageUrl" = 'https://dogdays.dev',
       "privacyPolicyUrl" = 'https://devdogsuga.org/legal/privacy'
 where tier = 'production' and label ilike '%dogdays%';

update platform."oauthRegistrations"
   set "homepageUrl" = 'https://dogpack.dev',
       "privacyPolicyUrl" = 'https://devdogsuga.org/legal/privacy'
 where tier = 'production' and label ilike '%dogpack%';

do $$
declare
  unmatched text;
begin
  select string_agg(label || ' (' || "clientId" || ')', ', ')
    into unmatched
    from platform."oauthRegistrations"
   where status = 'in_production' and "homepageUrl" is null;
  if unmatched is not null then
    raise notice 'In production clients without a homepage or privacy policy: %', unmatched;
  end if;
end $$;

-- The new redirect rule (http only on localhost, 127.0.0.1 and [::1]; https
-- everywhere else) against every stored redirect. Raises, naming the client and
-- the address, on the first one that fails, so the migration stops instead of
-- leaving a client the rule would refuse.
select platform.check_oauth_redirects();

-- Revokes the declarative tree implies for the new functions (anon and authenticated).
REVOKE ALL ON FUNCTION "platform"."check_oauth_redirects"() FROM "anon";
REVOKE ALL ON FUNCTION "platform"."check_oauth_redirects"() FROM "authenticated";
REVOKE ALL ON FUNCTION "platform"."moderation_client_tier"(uuid) FROM "anon";
REVOKE ALL ON FUNCTION "platform"."moderation_client_tier"(uuid) FROM "authenticated";
REVOKE ALL ON FUNCTION "platform"."oauth_refuses_user"(uuid, uuid) FROM "anon";
REVOKE ALL ON FUNCTION "platform"."oauth_refuses_user"(uuid, uuid) FROM "authenticated";
REVOKE ALL ON FUNCTION "platform"."oauth_revoke_app_access"(uuid, text, uuid) FROM "anon";
REVOKE ALL ON FUNCTION "platform"."oauth_revoke_app_access"(uuid, text, uuid) FROM "authenticated";
