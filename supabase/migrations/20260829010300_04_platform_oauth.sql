-- OAuth registrations and test accounts: who owns each auth.oauth_clients row,
-- and which auth.users rows are sign-in dummies rather than people.
--
-- platform."oauthTestAccounts" is in the foundation layer, ahead of the tables
-- that actually care about it, for one reason: platform.is_test_identity is
-- `language sql`, so its body is parsed and its relations resolved when the
-- function is created. The helpers file two migrations from here fails at
-- migrate time if this table does not exist yet.

-- Which environment a registration is for. Both kinds of client live on the
-- production instance, because Supabase requires OAuth clients to run over
-- HTTPS, so the environment is a column and not a separate database.
create type "platform"."oauthRegistrationType" as enum ('development', 'production');

-- An OAuth client and the member who registered it.
--
-- Three columns, and that is the whole table. It once also carried report
-- webhook and API-key plumbing, from a design where a reporting integration
-- was keyed to an OAuth client. Reporting now hangs off platform."apps", so
-- there is nothing here but ownership.
create table "platform"."oauthRegistrations" (
  "clientId" uuid not null
    constraint "oauthRegistrations_pkey" primary key,

  -- One registration per member, enforced rather than assumed: the ownership
  -- lookups elsewhere in the schema are written as scalar subqueries against
  -- this table and would break silently on a second row.
  "userId" uuid not null
    constraint "oauthRegistrations_userId_key" unique,

  "type" platform."oauthRegistrationType" not null
    default 'development'::platform."oauthRegistrationType"
);

-- The client row is the parent: delete the OAuth client and the registration
-- describing it is meaningless, so it goes too.
alter table "platform"."oauthRegistrations"
  add constraint "oauthRegistrations_clientId_oauth_clients_id_fkey"
  foreign key ("clientId") references auth."oauth_clients" ("id")
  on update cascade on delete cascade;

-- RESTRICT, and it is the only restrict in this file. Deleting the owner would
-- leave a live OAuth client that nobody is accountable for, still able to
-- issue tokens. Clearing the registration first is a deliberate step, not an
-- obstacle to route around.
alter table "platform"."oauthRegistrations"
  add constraint "oauthRegistrations_userId_users_id_fkey"
  foreign key ("userId") references auth."users" ("id")
  on update cascade on delete restrict;

-- Test accounts: real auth.users rows that exist only as sign-in targets for
-- verifying an OAuth integration.
--
-- Because they are real rows, a test-account token is an ordinary
-- `authenticated` token, and any policy permissive enough to say
-- `using (true)` is readable by one. That is what platform.is_test_identity
-- and the deny_test_identities policies exist to subtract. This table is the
-- source of truth for that check today; the custom_access_token hook is
-- commented out in config.toml, so there is no JWT claim to read instead.
create table "platform"."oauthTestAccounts" (
  "testUserId" uuid not null
    constraint "oauthTestAccounts_pkey" primary key,

  -- One test account per owner. A developer who needs a second one clears the
  -- first, which keeps the population of privileged-looking dummy accounts
  -- bounded by the number of developers.
  "ownerUserId" uuid not null
    constraint "oauthTestAccounts_ownerUserId_key" unique,

  -- `timestamp without time zone`, matching the rest of this early group of
  -- tables. Nothing reads it for arithmetic, so it has never been worth a type
  -- change that would show up as schema drift.
  "createdAt" timestamp without time zone not null default now()
);

-- Both sides cascade. If either the dummy or its owner leaves, the pairing is
-- over, and a stale row here would keep is_test_identity denying a reissued
-- account that is now a real person.
alter table "platform"."oauthTestAccounts"
  add constraint "oauthTestAccounts_testUserId_users_id_fkey"
  foreign key ("testUserId") references auth."users" ("id")
  on update cascade on delete cascade;

alter table "platform"."oauthTestAccounts"
  add constraint "oauthTestAccounts_ownerUserId_users_id_fkey"
  foreign key ("ownerUserId") references auth."users" ("id")
  on update cascade on delete cascade;

alter table "platform"."oauthRegistrations" enable row level security;
alter table "platform"."oauthTestAccounts" enable row level security;

-- Both tables are server-only, and the deny has two halves.
--
-- RLS is on and neither table has a permissive policy, so no client role can
-- read a row: that absence is the entire deny for SELECT. The restrictive
-- `false` policies below then hold under any future permissive policy, because
-- restrictive rules compose with AND. Someone adding "let a developer see
-- their own registration" has to change these lines on purpose rather than
-- open the table by accident.
--
-- Split per command rather than written as one `for all`, because a restrictive
-- `for all using (false)` also blocks SELECT, and these names are the ones
-- application tests reference.
--
-- platform.is_test_identity reads "oauthTestAccounts" straight through all of
-- this: it is SECURITY DEFINER with `set search_path = ''`, so RLS on the
-- table does not constrain it.
--
-- The same four names appear on both tables, and again on the leaderboard
-- tables. Policy names are scoped per table, so that is legal, and a pass that
-- deduplicates by name deletes live policies.

create policy "crud_public_policy_select"
  on "platform"."oauthRegistrations"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."oauthRegistrations"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_update"
  on "platform"."oauthRegistrations"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."oauthRegistrations"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_select"
  on "platform"."oauthTestAccounts"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."oauthTestAccounts"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_update"
  on "platform"."oauthTestAccounts"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."oauthTestAccounts"
  as restrictive
  for delete
  to public
using (false);
