-- Reject creation of ordinary Auth users whose email is not in UGA's primary
-- domain. This is a before-user-created Auth hook rather than an application
-- callback check, so password, OAuth, and future public sign-up paths share one
-- boundary. Supabase's service-role admin API intentionally bypasses Auth
-- hooks; callers with that key are already trusted to administer Auth users.

create or replace function "platform".require_uga_signup_email(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if email ~ '^[^@[:space:]]+@uga[.]edu$' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your uga.edu email address.'
    )
  );
end;
$$;

grant usage on schema "platform" to supabase_auth_admin;
grant execute on function "platform".require_uga_signup_email(jsonb)
  to supabase_auth_admin;
revoke execute on function "platform".require_uga_signup_email(jsonb)
  from public, anon, authenticated;
