CREATE OR REPLACE FUNCTION platform.require_uga_signup_email (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  email text := lower(trim(event -> 'user' ->> 'email'));
  provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
begin
  if provider = 'email' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Password sign-up is disabled. Sign in with Discord, GitHub, Google, or LinkedIn.'
      )
    );
  end if;

  if email ~ '^[^@[:space:]]+@uga[.]edu$' then
    -- The UGA address is the subject a deleted account is blocked by (see
    -- platform."deletedAccountBlocks").
    if "platform".is_deleted_account_blocked(email) then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'http_code', 403,
          'message', 'This account was deleted while a moderation action was in effect. Contact DevDogs to sign in.'
        )
      );
    end if;

    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your uga.edu email address.'
    )
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."require_uga_signup_email"(jsonb) TO "postgres", "service_role", "supabase_auth_admin";

REVOKE ALL ON FUNCTION "platform"."require_uga_signup_email"(jsonb) FROM PUBLIC;
