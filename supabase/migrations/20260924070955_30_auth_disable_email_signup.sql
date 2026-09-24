-- Refuse password self-registration outright, while leaving password SIGN-IN
-- and OAuth signup both untouched.
--
-- The obvious knob, `[auth.email] enable_signup` in `config.toml`, is the
-- wrong tool for this: GoTrue has exactly one flag per auth method
-- (`EmailProviderConfiguration.Enabled`, `GOTRUE_EXTERNAL_EMAIL_ENABLED`) and
-- it gates the whole email/password provider -- `internal/api/token.go`'s
-- password grant checks the same `config.External.Email.Enabled` that
-- `internal/api/signup.go` does, so setting it `false` also refuses
-- `POST /auth/v1/token?grant_type=password` with "Email logins are
-- disabled". Confirmed against gotrue v2.196.0's own source (the local
-- stack's `supabase/gotrue` image) -- there is no separate "signups only"
-- variant. That would lock every seeded persona in
-- `supabase/seed/development/02_moderation.sql` out of the one sign-in path
-- the local Docker stack has (it is plain HTTP, so it cannot host OAuth),
-- which is not an acceptable trade for closing the password-signup gap.
--
-- The `before_user_created` hook this extends is the one boundary already
-- shared by password signup, OAuth signup, and any future public sign-up
-- path (see 20260918000000_28_auth_uga_email_hook.sql), and it fires only on
-- ACCOUNT CREATION, never on sign-in -- so gating it costs nothing on the
-- login path. `event -> 'user' -> 'app_metadata' ->> 'provider'` is `'email'`
-- for both password and magic-link signups (`api.EmailProvider` in gotrue)
-- and the external provider's own slug (`google`, `discord`, ...) for OAuth,
-- set on the in-memory user by `SignupParams.ToUserModel` before the hook
-- ever runs -- so this is the one place that can tell "someone POSTed
-- /auth/v1/signup with a password" apart from "an OAuth provider vouched for
-- this identity" before either creates a row.
create or replace function "platform".require_uga_signup_email(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
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
