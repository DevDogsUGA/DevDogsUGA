-- Sandbox environments: the Supabase project a team builds against.
--
-- Three tables. "sandboxEnvironments" is the project registration, owned by a
-- person. "teamEnvironments" attaches a team to one. "envVars" is that
-- environment's configuration, some of it shared and some of it Vault-backed.
--
-- The one thing to know before editing: no client role ever reaches these
-- tables, and the deny is built three ways at once. `revoke all` takes back the
-- table grants the first migration's default privileges handed out; RLS is on
-- with no permissive policy, so nothing is selectable even if a grant returns;
-- and a restrictive no_client_* policy per command closes writes. Each layer
-- stands on its own, and each one removed is a step toward handing Vault secret
-- ids and proxy hostnames to anybody holding the publishable anon key.
--
-- Ordering: this file runs after the teams file, because teamEnvironments points
-- a composite foreign key at teamMembers("teamId", "userId", "role"), and after
-- the connections file, which declares envKind, envStatus and envVarVisibility.

-- ============================================================
-- sandboxEnvironments
-- ============================================================
--
-- An environment is owned by a PERSON, not a team, and teams attach to it.
-- That separation is the whole reason reuse and sharing work: a returning team
-- can attach the environment it used last time, and a lead running two projects
-- in one week does not need two Supabase projects.
create table "platform"."sandboxEnvironments" (
  "id"                 uuid not null default gen_random_uuid(),
  "name"               text not null,
  "kind"               "platform"."envKind" not null default 'owned',

  -- `on delete restrict`, not cascade and not set null. A deleted account must
  -- not silently take a live project's registration with it, and the column is
  -- `not null` so there is no third state to reason about. Deleting a user who
  -- owns an environment is refused, and the environment is orphaned through the
  -- documented teardown instead.
  "ownerUserId"        uuid not null,

  "projectRef"         text not null,
  "apiUrl"             text not null,

  -- Both populated from GET /v1/projects/{ref}/api-keys, selected by the
  -- response's `type` field. Do NOT match on `name`: a fresh project returns
  -- four keys, anon, service_role, and TWO both literally named "default", so
  -- matching on the name either picks a deprecated key or is ambiguous.
  "publishableKey"     text not null,
  "secretKeySecretId"  uuid not null,
  -- Retained for platform-side operations only. The proxy has no use for it:
  -- it signs nothing, and incoming user JWTs are passed through for upstream to
  -- verify rather than checked at the edge.
  "jwtSecretId"        uuid not null,

  -- Retired, never recycled. A stale .env or an already-installed Flutter build
  -- still points here, and if this name later resolved to a different team's
  -- project that build would silently read and write somebody else's database
  -- with a valid-looking hostname and no error.
  --
  -- The unique constraint is the mechanism, which only holds while rows are
  -- never hard-deleted: 'revoked' and 'orphaned' are terminal STATUSES, and a
  -- row in one of them is what continues to reserve the name. Deleting a dead
  -- environment row would free its hostname for reuse and reintroduce exactly
  -- the cross-team leak this prevents.
  "proxyHostname"      text not null,

  "prewarmEnabled"     boolean not null default true,
  "autoPauseEnabled"   boolean not null default true,
  "status"             "platform"."envStatus" not null default 'provisioning',

  "lastSeenActiveAt"   timestamptz,
  "provisionedAt"      timestamptz,
  "revokedAt"          timestamptz,
  "createdAt"          timestamptz not null default now(),

  constraint "sandboxEnvironments_pkey" primary key ("id"),
  constraint "sandboxEnvironments_proxyHostname_key" unique ("proxyHostname"),
  constraint "sandboxEnvironments_projectRef_key" unique ("projectRef"),
  constraint "sandboxEnvironments_ownerUserId_fkey" foreign key ("ownerUserId")
    references "auth"."users"("id") on delete restrict,

  -- Redundant against the primary key, and required anyway: teamEnvironments
  -- carries a composite FK at (id, ownerUserId) so that a team's attachment and
  -- the environment's owner cannot drift apart. A composite FK needs a matching
  -- unique constraint to point at.
  constraint "sandboxEnvironments_id_ownerUserId_key" unique ("id", "ownerUserId")
);

create index "sandboxEnvironments_ownerUserId_idx"
  on "platform"."sandboxEnvironments" ("ownerUserId");

-- The pre-warm and auto-pause passes both filter on status.
create index "sandboxEnvironments_status_idx"
  on "platform"."sandboxEnvironments" ("status");

alter table "platform"."sandboxEnvironments" enable row level security;

-- The row holds Vault secret ids and a publishable key. Members reach their own
-- environment's details through a loader that checks reachability, so there is
-- no client-side read path to open here.
create policy "no_client_select" on "platform"."sandboxEnvironments"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_insert" on "platform"."sandboxEnvironments"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."sandboxEnvironments"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."sandboxEnvironments"
  as restrictive for delete to anon, authenticated using (false);

revoke all on "platform"."sandboxEnvironments" from anon, authenticated;

-- ============================================================
-- teamEnvironments
-- ============================================================
--
-- Which environment a team uses. Many teams may point at one environment, so
-- this is a join rather than a column on `teams`.
--
-- The check plus the two composite foreign keys together enforce one invariant
-- that is otherwise a trigger: **the environment's owner is the lead of every
-- team attached to it.**
--
--   FK 1 ties this row to an environment AND its owner.
--   FK 2 requires a teamMembers row for that same person on this team with
--        role 'lead'.
--   The check pins ownerRole to 'lead' so FK 2 cannot be satisfied by an
--        ordinary membership.
--
-- `on update restrict on delete restrict` on FK 2 is what makes it bite: it
-- refuses to demote or remove the lead of a team whose environment they own.
-- The remedy is to detach the environment first, which is a deliberate action
-- rather than a surprise.
create table "platform"."teamEnvironments" (
  "teamId"        uuid not null,
  "environmentId" uuid not null,
  "ownerUserId"   uuid not null,
  "ownerRole"     "platform"."teamRole" not null default 'lead',
  "attachedAt"    timestamptz not null default now(),
  -- No foreign key, the same convention the audit columns on `teams` follow.
  "attachedBy"    uuid not null,

  constraint "teamEnvironments_pkey" primary key ("teamId"),
  constraint "teamEnvironments_owner_is_lead" check ("ownerRole" = 'lead'),

  constraint "teamEnvironments_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on delete cascade,

  constraint "teamEnvironments_environmentId_ownerUserId_fkey"
    foreign key ("environmentId", "ownerUserId")
    references "platform"."sandboxEnvironments"("id", "ownerUserId"),

  constraint "teamEnvironments_teamId_ownerUserId_ownerRole_fkey"
    foreign key ("teamId", "ownerUserId", "ownerRole")
    references "platform"."teamMembers"("teamId", "userId", "role")
    on update restrict on delete restrict
);

create index "teamEnvironments_environmentId_idx"
  on "platform"."teamEnvironments" ("environmentId");

alter table "platform"."teamEnvironments" enable row level security;

-- Which environment a team uses is not a secret from that team, but this table
-- is read through loaders alongside the environment itself, so there is no
-- reason to open a direct path.
create policy "no_client_select" on "platform"."teamEnvironments"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_insert" on "platform"."teamEnvironments"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teamEnvironments"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teamEnvironments"
  as restrictive for delete to anon, authenticated using (false);

revoke all on "platform"."teamEnvironments" from anon, authenticated;

-- ============================================================
-- envVars
-- ============================================================
--
-- Generalizes past Supabase: an environment's configuration, some of it shared
-- with members and some of it never leaving the platform.
create table "platform"."envVars" (
  "environmentId" uuid not null,
  "key"           text not null,
  "value"         text,
  "secretId"      uuid,
  "visibility"    "platform"."envVarVisibility" not null,
  "updatedBy"     uuid not null,
  "updatedAt"     timestamptz not null default now(),

  constraint "envVars_pkey" primary key ("environmentId", "key"),
  constraint "envVars_environmentId_fkey" foreign key ("environmentId")
    references "platform"."sandboxEnvironments"("id") on delete cascade,

  -- Exactly one of the two storage columns, always. Without this a 'secret' var
  -- could carry an inline `value` and be handed to a member by any code path
  -- that reads the column without checking visibility first.
  constraint "envVars_one_storage" check (num_nonnulls("value", "secretId") = 1),

  -- ...and the storage column has to match the declared visibility, which the
  -- constraint above does not say on its own.
  constraint "envVars_storage_matches_visibility" check (
    ("visibility" = 'shared' and "value" is not null) or
    ("visibility" = 'secret' and "secretId" is not null)
  )
);

alter table "platform"."envVars" enable row level security;

create policy "no_client_select" on "platform"."envVars"
  as restrictive for select to anon, authenticated using (false);
create policy "no_client_insert" on "platform"."envVars"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."envVars"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."envVars"
  as restrictive for delete to anon, authenticated using (false);

revoke all on "platform"."envVars" from anon, authenticated;
