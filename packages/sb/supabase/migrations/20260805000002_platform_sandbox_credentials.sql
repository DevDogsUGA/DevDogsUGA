-- Member credentials, the proxy's audit trail, and the narrow role the proxy
-- Worker reaches them through.
--
-- Third of three sandbox migrations.
--
-- This is the one place in the teams work that stays an RPC. Everywhere else,
-- writes are server actions, because the platform is the only caller. Here the
-- caller is the proxy Worker -- a separate client, on separate infrastructure,
-- holding its own credential -- so the contract has to live where every caller
-- must pass through it.

-- ============================================================
-- sandboxCredentials
-- ============================================================
--
-- One row per (contributor, environment, scope), for the lifetime of the pair.
--
-- Scope is part of the key because authority follows the credential rather than
-- a header: a member holds a publishable token and a secret token, presents
-- whichever the situation calls for exactly as they would upstream, and the
-- secret one can be disabled on its own.
create table "platform"."sandboxCredentials" (
  "id"            uuid not null default gen_random_uuid(),
  "environmentId" uuid not null,
  "userId"        uuid not null,

  -- Opaque random string, stored hashed, following the `reportApiKeyHash`
  -- pattern in oauthRegistrations. The plaintext is shown once at issue time.
  "tokenHash"     text not null,

  "scope"         "platform"."proxyScope" not null,
  "status"        "platform"."credentialStatus" not null default 'active',

  "lastUsedAt"    timestamptz,
  "disabledAt"    timestamptz,
  "rotatedAt"     timestamptz,
  "revokedAt"     timestamptz,
  "issuedAt"      timestamptz not null default now(),

  constraint "sandboxCredentials_pkey" primary key ("id"),

  -- Unconditional, so history, lastUsedAt and the audit trail survive a member
  -- leaving a team and returning. Re-granting access reactivates this row
  -- rather than issuing a second one.
  constraint "sandboxCredentials_environmentId_userId_scope_key"
    unique ("environmentId", "userId", "scope"),

  -- The lookup the proxy performs on every single request.
  constraint "sandboxCredentials_tokenHash_key" unique ("tokenHash"),

  constraint "sandboxCredentials_environmentId_fkey" foreign key ("environmentId")
    references "platform"."sandboxEnvironments"("id") on delete cascade,
  constraint "sandboxCredentials_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on delete cascade
);

create index "sandboxCredentials_userId_idx"
  on "platform"."sandboxCredentials" ("userId");

alter table "platform"."sandboxCredentials" enable row level security;

create policy "no_client_select" on "platform"."sandboxCredentials"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_insert" on "platform"."sandboxCredentials"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."sandboxCredentials"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."sandboxCredentials"
  as restrictive for delete to anon, authenticated using (false);

revoke all on "platform"."sandboxCredentials" from anon, authenticated;

-- ============================================================
-- Audit trails
-- ============================================================

-- Every proxied request. `credentialId` rather than a user id because that is
-- what makes elevation attributable: the credential carries the scope, so
-- joining this table to sandboxCredentials says which requests ran with the
-- secret key without trusting anything the caller asserted.
create table "platform"."proxyRequestLog" (
  "id"           bigint generated always as identity,
  "credentialId" uuid not null,
  "method"       text not null,
  "path"         text not null,
  "status"       smallint not null,
  "at"           timestamptz not null default now(),

  constraint "proxyRequestLog_pkey" primary key ("id"),
  constraint "proxyRequestLog_credentialId_fkey" foreign key ("credentialId")
    references "platform"."sandboxCredentials"("id") on delete cascade
);

create index "proxyRequestLog_credentialId_at_idx"
  on "platform"."proxyRequestLog" ("credentialId", "at" desc);

-- Platform-side key retrieval, which is a different event from a proxied
-- request: this is somebody reading an environment's keys through the console.
create table "platform"."envAccessLog" (
  "id"            bigint generated always as identity,
  "environmentId" uuid not null,
  "userId"        uuid not null,
  "keysFetched"   text[] not null,
  "at"            timestamptz not null default now(),

  constraint "envAccessLog_pkey" primary key ("id"),
  constraint "envAccessLog_environmentId_fkey" foreign key ("environmentId")
    references "platform"."sandboxEnvironments"("id") on delete cascade
);

create index "envAccessLog_environmentId_at_idx"
  on "platform"."envAccessLog" ("environmentId", "at" desc);

alter table "platform"."proxyRequestLog" enable row level security;
alter table "platform"."envAccessLog" enable row level security;

create policy "no_client_select" on "platform"."proxyRequestLog"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_write" on "platform"."proxyRequestLog"
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "no_client_select" on "platform"."envAccessLog"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_write" on "platform"."envAccessLog"
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on "platform"."proxyRequestLog" from anon, authenticated;
revoke all on "platform"."envAccessLog" from anon, authenticated;

-- ============================================================
-- The narrow role
-- ============================================================
--
-- Roles are CLUSTER-level, not database-level, so they survive `supabase db
-- reset` while the tables above do not. Creating one unconditionally makes the
-- second reset fail; hence the guard.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sandbox_proxy') then
    create role "sandbox_proxy" nologin;
  end if;
end
$$;

-- What lets PostgREST `set role sandbox_proxy` when it sees that claim in a
-- JWT. Without this grant the role exists but is unreachable over the API.
grant "sandbox_proxy" to "authenticator";

-- EXECUTE requires USAGE on the containing schema. This is the entire extent of
-- the role's schema access: no table grants follow, so `usage` here buys the
-- ability to call the two functions below and nothing else.
grant usage on schema "platform" to "sandbox_proxy";

-- ============================================================
-- resolve_sandbox_credential
-- ============================================================
--
-- The proxy's whole read of platform state, in one call.
--
-- Three deviations from the original design sketch, each fixing something that
-- would have been a defect:
--
--   1. **It takes the hostname as well as the token.** Resolving the token
--      alone would let a credential minted for environment A be presented at
--      environment B's hostname and resolve successfully -- the worker would
--      have to remember to compare the two itself, forever, in every path. The
--      binding belongs here, where it cannot be forgotten.
--
--   2. **It returns the secret key, and only for a 'secret' credential.** The
--      worker needs that key to serve an elevated request, and the earlier
--      sketch never said where it came from. Deciding it HERE means a
--      publishable credential cannot obtain the secret key even if the proxy's
--      routing is buggy: the elevation check is a database fact rather than an
--      `if` in a Worker.
--
--   3. **It returns an `outcome` rather than zero rows on failure.** The proxy
--      owes an unknown or retired hostname a 410 and a bad credential a 401,
--      and it cannot tell those apart from an empty result. Discriminating here
--      keeps it to one round trip and puts the distinction next to the data
--      that determines it.
--
-- `team_id` is deliberately absent. One environment serves many teams and a
-- member can be reachable through more than one of them, so there is no single
-- correct answer; `credential_id` is what the audit trail actually needs.
create or replace function "platform".resolve_sandbox_credential(
  hostname text,
  token_hash text
)
returns table (
  outcome         text,
  credential_id   uuid,
  environment_id  uuid,
  user_id         uuid,
  project_ref     text,
  upstream_url    text,
  publishable_key text,
  secret_key      text,
  scope           "platform"."proxyScope",
  environment_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  env  record;
  cred record;
begin
  select e."id", e."status", e."name", e."projectRef", e."apiUrl",
         e."publishableKey", e."secretKeySecretId"
    into env
    from "platform"."sandboxEnvironments" e
   where e."proxyHostname" = hostname;

  if not found then
    return query select 'unknown_host'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::"platform"."proxyScope", null::text;
    return;
  end if;

  -- Terminal states keep their row precisely so the hostname stays reserved.
  -- The name goes back so the 410 body can say which environment this was,
  -- which is the difference between an old build failing legibly and looking
  -- like a network fault.
  if env."status" in ('revoked', 'orphaned') then
    return query select 'retired_host'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::"platform"."proxyScope", env."name"::text;
    return;
  end if;

  select c."id", c."userId", c."scope", c."status", c."environmentId"
    into cred
    from "platform"."sandboxCredentials" c
   where c."tokenHash" = token_hash;

  -- One branch for "no such token", "disabled", "revoked", and "belongs to a
  -- different environment". They are the same answer to the caller by design:
  -- distinguishing them over the wire would turn the proxy into an oracle for
  -- which tokens exist and which environments they belong to.
  if not found
     or cred."status" <> 'active'
     or cred."environmentId" <> env."id" then
    return query select 'bad_credential'::text,
      null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::text, null::"platform"."proxyScope", null::text;
    return;
  end if;

  return query
    select 'ok'::text,
           cred."id",
           env."id",
           cred."userId",
           env."projectRef"::text,
           env."apiUrl"::text,
           env."publishableKey"::text,
           -- The elevation, enforced in SQL. A 'publishable' credential gets
           -- null here no matter what the caller asked for.
           case when cred."scope" = 'secret'
                then (select v."decrypted_secret"
                        from "vault"."decrypted_secrets" v
                       where v."id" = env."secretKeySecretId")
                else null
           end::text,
           cred."scope",
           env."name"::text;
end
$$;

-- `from public` alone is NOT enough here, and the difference is the whole
-- security of this function.
--
-- Verified against the live local database: this schema carries
--
--   alter default privileges in schema platform
--     grant execute on functions to anon, authenticated, service_role;
--
-- so every newly created function arrives with EXPLICIT per-role grants, not
-- just the implicit PUBLIC one. Revoking PUBLIC strips `=X/postgres` from the
-- ACL and leaves `anon=X/postgres` and `authenticated=X/postgres` untouched --
-- which left a SECURITY DEFINER function that returns decrypted Vault secrets
-- callable by any browser holding an authenticated JWT, through PostgREST,
-- with no proxy involved at all.
--
-- That default is correct for the moderation RPCs, which clients are meant to
-- call. It is exactly wrong for this one. Name every role.
--
-- service_role is revoked too. The platform reaches these tables through
-- Drizzle as the owner, so nothing legitimate calls this as service_role, and
-- leaving the grant would mean the platform's own secret key could do the one
-- thing the narrow role exists to prevent it needing to.
revoke execute on function "platform".resolve_sandbox_credential(text, text)
  from public, "anon", "authenticated", "service_role";
grant  execute on function "platform".resolve_sandbox_credential(text, text)
  to "sandbox_proxy";

-- ============================================================
-- log_proxy_request
-- ============================================================
--
-- A second function rather than an INSERT grant, for two reasons. It keeps the
-- role's table-level privileges at exactly zero, and it lets the definer stamp
-- `lastUsedAt` in the same round trip -- which the reachability reconcile reads,
-- and which the worker could not write on its own without a table grant.
--
-- Unknown credential ids are ignored rather than raised. A log write must never
-- be the thing that fails a request that already succeeded.
create or replace function "platform".log_proxy_request(
  credential_id uuid,
  method text,
  path text,
  status smallint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from "platform"."sandboxCredentials" c where c."id" = credential_id
  ) then
    return;
  end if;

  insert into "platform"."proxyRequestLog" ("credentialId", "method", "path", "status")
  values (credential_id, method, path, status);

  update "platform"."sandboxCredentials"
     set "lastUsedAt" = now()
   where "id" = credential_id;
end
$$;

-- Same reasoning as above. Left open, this would let any signed-in member forge
-- entries in the proxy's audit trail and stamp `lastUsedAt` on credentials that
-- were never used -- quietly defeating the reachability reconcile.
revoke execute on function "platform".log_proxy_request(uuid, text, text, smallint)
  from public, "anon", "authenticated", "service_role";
grant  execute on function "platform".log_proxy_request(uuid, text, text, smallint)
  to "sandbox_proxy";

-- ============================================================
-- Closing PUBLIC on the schema's function surface
-- ============================================================
--
-- This is what makes `sandbox_proxy` actually narrow, and it is schema-wide
-- rather than sandbox-specific because the hole is schema-wide.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and PUBLIC means
-- every role -- including one created specifically to have no privileges.
-- Measured on the live local database before this statement existed:
-- `sandbox_proxy`, holding no table grants at all, could execute 18 of this
-- schema's functions, every one of them SECURITY DEFINER. SECURITY DEFINER is
-- the part that matters: those functions run as the owner, so the role's empty
-- table privileges stop nothing. `claim_root` was among them.
--
-- Verified safe before revoking: all 18 carry EXPLICIT grants to anon,
-- authenticated and service_role from this schema's default privileges, so
-- dropping PUBLIC changes nothing for any caller that is supposed to reach
-- them. The eight internal functions (resolve_content, apply_content_action,
-- the *_as variants) had already revoked PUBLIC by hand -- this generalizes
-- that practice instead of relying on each new function to remember it.
revoke execute on all functions in schema "platform" from public;

-- ...and keep it closed. Without this, the next migration to add a function
-- reopens the hole silently, and nothing would fail to draw attention to it.
alter default privileges in schema "platform" revoke execute on functions from public;
