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

GRANT EXECUTE ON FUNCTION "platform"."restrict_oauth_tokens"(jsonb) TO "postgres", "service_role", "supabase_auth_admin";

REVOKE ALL ON FUNCTION "platform"."restrict_oauth_tokens"(jsonb) FROM PUBLIC;
