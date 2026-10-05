-- "Sign in with DevDogs" is a local-development identity provider and nothing
-- else. A contributor's local stack registers it as a custom OAuth provider:
-- local GoTrue exchanges the code at this project's token endpoint, reads the
-- userinfo endpoint once, and from then on issues its own local session. No
-- deployed app signs in through it (they all share this project's Supabase
-- auth directly), so a token issued to an OAuth client has exactly one
-- legitimate use: the userinfo call.
--
-- Until now that token was an ordinary `authenticated` session. Two gaps
-- followed from that:
--
-- 1. Who could get one was enforced only by `/oauth/consent` (owner picks one
--    of their own test accounts). GoTrue's own consent endpoint,
--    `POST /auth/v1/oauth/authorizations/{id}/consent`, accepts any signed-in
--    user's session, so any member could approve any client -- registered or
--    not -- as themselves.
-- 2. Whoever held the token could use it against PostgREST, Storage, and
--    every RPC granted to `authenticated`, with the signed-in user's full
--    permissions (an officer's included).
--
-- Both are closed here, at the one point every token passes through: the
-- custom access token hook (enabled in config.toml, pushed to hosted projects
-- by `supabase config push` in deploy.yaml, after migrations run).
--
--   * A token for an OAuth client is issued only if the client is registered
--     in platform."oauthRegistrations" AND the user is the registration's
--     owner or one of that owner's test accounts. Anything else -- an
--     unregistered client, someone else's account -- is refused outright, on
--     the first exchange and on every refresh.
--   * A token that is issued gets `role = oauth_identity`, a role with no
--     privileges anywhere. PostgREST and Storage switch to the JWT's role, so
--     every data request made with it fails; GoTrue's userinfo endpoint reads
--     the user from `sub` and is unaffected.
--
-- Every other token (the platform's own Google sign-in, local password
-- personas, ...) carries no OAuth client and passes through untouched.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oauth_identity') then
    create role "oauth_identity" nologin noinherit;
  end if;
end;
$$;

-- PostgREST's authenticator must be able to SET ROLE to the JWT's role, or it
-- refuses the request before RLS is consulted. Membership is all it gets:
-- no schema usage, table, sequence, or function grants exist for this role,
-- and PUBLIC's only schema usage is the intentionally empty `public`.
grant "oauth_identity" to authenticator;

create or replace function "platform".restrict_oauth_tokens(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  user_id uuid := (event ->> 'user_id')::uuid;
  client_id uuid;
  owner_id uuid;
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

  select r."userId"
    into owner_id
    from "platform"."oauthRegistrations" r
   where r."clientId" = client_id;

  if owner_id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This OAuth client is not registered to a DevDogs member.'
      )
    );
  end if;

  if user_id is distinct from owner_id and not exists (
    select 1
      from "platform"."oauthTestAccounts" t
     where t."testUserId" = user_id
       and t."ownerUserId" = owner_id
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Sign in with DevDogs only signs in the client''s owner or their test accounts.'
      )
    );
  end if;

  return jsonb_build_object(
    'claims', jsonb_set(claims, '{role}', '"oauth_identity"')
  );
end;
$$;

-- SECURITY DEFINER (owned by postgres, like platform.is_test_identity) so the
-- restrictive deny-all policies on oauthRegistrations and oauthTestAccounts do
-- not hide the rows this has to read. Only GoTrue may call it.
grant execute on function "platform".restrict_oauth_tokens(jsonb)
  to supabase_auth_admin;
revoke execute on function "platform".restrict_oauth_tokens(jsonb)
  from public, anon, authenticated;
