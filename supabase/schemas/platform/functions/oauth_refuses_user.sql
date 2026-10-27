CREATE OR REPLACE FUNCTION platform.oauth_refuses_user (
  p_client uuid,
  p_user uuid
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

GRANT EXECUTE ON FUNCTION "platform"."oauth_refuses_user"(uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."oauth_refuses_user"(uuid, uuid) FROM PUBLIC;
