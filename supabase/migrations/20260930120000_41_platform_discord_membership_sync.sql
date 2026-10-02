-- Two-way Discord role membership sync, officers' Discord ids, and President
-- stops syncing.
--
-- Role membership used to be one-way: the sync-discord-roles cron made the
-- platform match Discord for every user who had linked Discord. With no record
-- of what the two sides last agreed on, a grant made on the platform first
-- (the seed, the console, the CLI) was indistinguishable from a revoke made on
-- Discord, and was undone on the next run.
--
-- "discordRoleMemberships" is that record: one row per (user, synced role) that
-- both sides held at the last successful sync. Each run compares the platform,
-- live Discord and this snapshot:
--
--   platform changed only -> push to Discord
--   Discord changed only  -> pull to the platform
--   both changed          -> they agree (it is a yes/no value); only the
--                            snapshot moves
--
-- A failed push leaves the snapshot stale, so the next run retries it. A grant
-- to a user with no known Discord id has no snapshot row and counts as a
-- platform change, so it is pushed on the first run after the id is known.
--
-- "officerDiscordIds" lets an admin record an officer's Discord user id before
-- they link through OAuth, so the cron can sync their roles straight away. It
-- is entered without OAuth proof, so it is for officers only, and a linked
-- OAuth identity always wins over it.
--
-- Both tables are server-only: RLS on, closed on every verb, reached through
-- the service key like "userRoles".

create table "platform"."discordRoleMemberships" (
  "userId" uuid not null,
  "roleId" uuid not null,
  "syncedAt" timestamptz not null default now(),

  constraint "discordRoleMemberships_pkey" primary key ("userId", "roleId"),
  constraint "discordRoleMemberships_userId_users_id_fkey"
    foreign key ("userId") references auth.users("id") on delete cascade,
  constraint "discordRoleMemberships_roleId_roles_id_fkey"
    foreign key ("roleId") references platform."roles"("id") on delete cascade
);

create index "discordRoleMemberships_roleId_idx"
  on "platform"."discordRoleMemberships" ("roleId");

create table "platform"."officerDiscordIds" (
  "userId" uuid not null,
  "discordUserId" text not null,
  "createdAt" timestamptz not null default now(),

  constraint "officerDiscordIds_pkey" primary key ("userId"),
  constraint "officerDiscordIds_userId_users_id_fkey"
    foreign key ("userId") references auth.users("id") on delete cascade,
  constraint "officerDiscordIds_discordUserId_snowflake_check"
    check ("discordUserId" ~ '^[0-9]{15,25}$')
);

create unique index "officerDiscordIds_discordUserId_key"
  on "platform"."officerDiscordIds" ("discordUserId");

alter table "platform"."discordRoleMemberships" enable row level security;
alter table "platform"."officerDiscordIds" enable row level security;

create policy "crud_public_policy_delete" on "platform"."discordRoleMemberships"
  as restrictive for delete to public using (false);
create policy "crud_public_policy_insert" on "platform"."discordRoleMemberships"
  as restrictive for insert to public with check (false);
create policy "crud_public_policy_select" on "platform"."discordRoleMemberships"
  as restrictive for select to public using (false);
create policy "crud_public_policy_update" on "platform"."discordRoleMemberships"
  as restrictive for update to public using (false) with check (false);

create policy "crud_public_policy_delete" on "platform"."officerDiscordIds"
  as restrictive for delete to public using (false);
create policy "crud_public_policy_insert" on "platform"."officerDiscordIds"
  as restrictive for insert to public with check (false);
create policy "crud_public_policy_select" on "platform"."officerDiscordIds"
  as restrictive for select to public using (false);
create policy "crud_public_policy_update" on "platform"."officerDiscordIds"
  as restrictive for update to public using (false) with check (false);

-- President is granted and revoked on the platform only; its Discord role is
-- managed by hand. The bot cannot manage it anyway: it sits above RoboDog.
update "platform"."roles"
set "discordRoleId" = null,
    "discordSyncedName" = null,
    "discordSyncedColor" = null
where "id" = '00000000-0000-0000-0000-000000000002';
