-- Sandbox foundations: the five enums the three sandbox files share, and
-- platform."supabaseConnections", one row per member who has connected their
-- Supabase account.
--
-- The enums are declared here rather than beside their tables because they are
-- shared: envKind, envStatus and envVarVisibility are consumed by the next
-- file, credentialStatus and proxyScope by the one after. Types resolve at
-- CREATE TABLE time, so this file has to run first.
--
-- Nothing in this file is reachable from a browser. Every column is either a
-- Vault secret id or metadata about somebody's personal Supabase account, and
-- the only legitimate reader is the platform connecting as the owner. See
-- docs/platform/sandbox-environments.md.

-- ============================================================
-- Enums
-- ============================================================

-- 'owned' is a free project created under the member's own account. 'branch'
-- is the paid Supabase branching path, ruled out today but kept reachable:
-- switching later changes provisioning and nothing else.
create type "platform"."envKind" as enum ('owned', 'branch');

-- The platform's own lifecycle, NOT a mirror of Supabase's 15-value project
-- status. Map theirs onto this at the boundary. Anything unrecognized is
-- treated as not-ready rather than invented as a new state here.
--
-- 'detached' is not teardown. A detached environment keeps its project, its
-- hostname, its Vault secrets and its member credentials; it auto-pauses and
-- waits to be re-attached. Deleting anything at detach time would make "attach
-- the environment I used last month" mean full re-provisioning, which is the
-- friction this feature exists to remove.
create type "platform"."envStatus" as enum (
  'provisioning', 'active', 'paused', 'restoring',
  'detached', 'revoked', 'orphaned'
);

-- 'disabled' is reversible and 'revoked' is terminal. The distinction carries
-- real weight: people leave a team and rejoin, or come back for the next event
-- on the same environment, and that must not cost them their history.
create type "platform"."credentialStatus" as enum ('active', 'disabled', 'revoked');

-- The key class a member token stands in for, mirroring upstream's
-- publishable/secret split.
--
-- This is the axis that decides authority, and it is deliberately NOT team
-- role: a lead has no more reason to bypass RLS than anybody else. Presenting
-- a 'secret' token is how a member asks for the service_role key, exactly as
-- presenting sb_secret_... does against a real project. There is no header
-- that grants elevation, because a header can be attached to any request by
-- anything holding the one token, whereas a credential is provisioned,
-- disabled and audited on its own.
create type "platform"."proxyScope" as enum ('publishable', 'secret');

-- A 'shared' env var has its value inline; a 'secret' one lives in Vault and
-- is never delivered to a member, only used by platform-side operations. That
-- is what keeps the secret key out of .env.local while still living in the
-- same system the members configure.
create type "platform"."envVarVisibility" as enum ('shared', 'secret');

-- ============================================================
-- supabaseConnections
-- ============================================================
--
-- One row per member who has connected their Supabase account. The tokens
-- themselves are in Vault; this table holds only their ids.
--
-- `expiresAt` exists so the daily refresh cron can find grants about to lapse
-- without decrypting anything. Access tokens last 24h (measured), so a daily
-- pass has ample margin.
--
-- `scopes` is recorded at grant time rather than read back from Supabase,
-- because it CANNOT be read back: the token response carries no `scope` field,
-- so what was granted is only discoverable by calling an endpoint and seeing
-- whether it works. Storing what was requested at least gives the startup
-- probe something to compare against.
create table "platform"."supabaseConnections" (
  "userId"               uuid not null,
  "orgSlug"              text not null,
  "accessTokenSecretId"  uuid not null,
  "refreshTokenSecretId" uuid not null,
  "expiresAt"            timestamptz not null,
  "scopes"               text[] not null,
  "connectedAt"          timestamptz not null default now(),

  constraint "supabaseConnections_pkey" primary key ("userId"),
  -- Cascades: the grant is meaningless without the account that made it, and
  -- unlike an environment it carries no history worth preserving.
  constraint "supabaseConnections_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on delete cascade
);

-- Finds grants due for refresh without a sequential scan once this table has a
-- row per active officer and lead.
create index "supabaseConnections_expiresAt_idx"
  on "platform"."supabaseConnections" ("expiresAt");

alter table "platform"."supabaseConnections" enable row level security;

-- Deny-everything, not the public-select-plus-deny-writes shape used elsewhere
-- in this schema. There is no permissive policy, so there is nothing for a
-- client role to select even before the restrictive policies below. That
-- absence is the whole deny for SELECT; the restrictive trio closes the write
-- side. Both halves are stated on purpose: RLS with no policy at all reads as
-- an oversight, and the next person to add a permissive policy for a console
-- page should have to delete an explicit refusal to do it.
create policy "no_client_select" on "platform"."supabaseConnections"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_insert" on "platform"."supabaseConnections"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."supabaseConnections"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."supabaseConnections"
  as restrictive for delete to anon, authenticated using (false);

-- The third layer, and the one that does the work at the grant level rather
-- than the row level. The default privileges in the first migration hand ALL
-- on every new platform table to anon, authenticated and service_role; this
-- takes it back from the two client roles and leaves service_role, which is
-- how the server reads this table. Without it the table is still protected,
-- but only by RLS.
revoke all on "platform"."supabaseConnections" from anon, authenticated;
