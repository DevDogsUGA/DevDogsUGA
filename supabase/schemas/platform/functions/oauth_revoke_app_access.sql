CREATE OR REPLACE FUNCTION platform.oauth_revoke_app_access (
  p_client uuid,
  p_scope text,
  p_user uuid DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION "platform"."oauth_revoke_app_access"(uuid, text, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."oauth_revoke_app_access"(uuid, text, uuid) FROM PUBLIC;
