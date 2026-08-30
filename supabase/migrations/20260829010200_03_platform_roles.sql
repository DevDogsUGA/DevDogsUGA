-- ============================================================
-- Roles, credentials, and who holds what
-- ============================================================
--
-- Four tables. platform."roles" is the permission catalogue: every permission
-- the platform has is one nullable boolean column on it. platform."userRoles"
-- and platform."credentialRoles" assign roles to people and to shared logins.
-- platform."credentials" holds the shared logins themselves.
--
-- The one thing to know before editing this file: adding a permission column
-- here is only half a change. The other half is
-- 20260829010500_06_platform_permission_resolution.sql, which projects each
-- permission column into the "resolvedUserPermissions" materialized view and
-- names it in the roles refresh trigger's `update of` list. A column added here
-- and nowhere else looks granted in the console and resolves false everywhere it
-- is checked, and nothing errors. has_permission() looks a permission up by name
-- against the view and returns false for a name it does not find.
--
-- Not in this file: the "deny_test_identities" policy on platform."roles". It
-- calls platform.is_test_identity(), a policy predicate is parsed at CREATE
-- POLICY time, and that function does not exist yet. It lands in file 06 with
-- the rest of the permission machinery.

-- ============================================================
-- Enums
-- ============================================================

-- Shared officer logins take one of three shapes. The secrets themselves live in
-- Vault; "credentials" stores only the ids that point at them.
create type "platform"."credentialType" as enum ('email_password', 'totp', 'email_password_totp');

-- 'default' is the role everyone gets, 'root' is the single all-permissions
-- role, 'custom' is everything the officers create. Only 'custom' roles are read
-- by the permission resolver, and only 'custom' roles carry a rank. Enum labels
-- are stored in declaration order and that order is what `order by` sees, so a
-- new label has to be added with an explicit BEFORE/AFTER rather than appended
-- to this list.
create type "platform"."roleType" as enum ('default', 'root', 'custom');


-- ============================================================
-- credentials
-- ============================================================
--
-- Shared logins for the accounts a club owns rather than a person: the club
-- email, the Instagram, the Airtable service user. A credential holds roles the
-- same way a member does, which is how "who is allowed to use the club email"
-- is answered with the same vocabulary as "who is allowed to moderate".
--
-- Deny-all to every client. Reads and writes go through the service key.

create table "platform"."credentials" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "description" text,
  "type" platform."credentialType" not null,
  "email" text,
  -- Vault secret ids, not secrets. Nothing in this schema can read the values.
  "passwordSecretId" uuid,
  "totpSecretId" uuid,
  "createdAt" timestamp with time zone not null default now(),
  "createdBy" uuid,

  constraint "credentials_pkey" primary key ("id"),
  -- Deleting the officer who created a credential must not delete the club's
  -- login, so the authorship is what gets forgotten.
  constraint "credentials_createdBy_users_id_fkey"
    foreign key ("createdBy") references auth.users("id") on delete set null
);

alter table "platform"."credentials" enable row level security;


-- ============================================================
-- roles
-- ============================================================
--
-- Every "can*" column is boolean and NULLABLE, and the nullability is
-- load-bearing. Null means "this role says nothing about this permission", not
-- "deny". The resolver takes the lowest-ranked role that expresses an opinion,
-- which is what lets a high role grant something without every role beneath it
-- having to repeat the answer. Give one of these a `not null default false` and
-- every role starts denying everything below it.
--
-- Column ORDER here reproduces the order the old migration history arrived at:
-- the first six permissions sit where they were originally declared, the last
-- five were added years later in the file's history and so sit after the Discord
-- columns. Grouping all eleven together would read better and would change what
-- `select *` returns in what order. Leave them where they are.
--
-- There is no "canManageFeedback". It existed, the feedback feature was removed,
-- and the column went with it. Nothing in this repo may write that name again:
-- the matview body and the trigger column list in file 06 both used to carry it,
-- and a stray reference there is a silent staleness bug rather than an error.
--
-- There is deliberately no "canManageMeetings" either. Meetings, workshops,
-- competitions and side awards are authored in Airtable, and access to the base
-- IS the permission. A second one in Postgres would create two systems that can
-- disagree about who is an officer, and Airtable would win, because that is
-- where the writes happen.

create table "platform"."roles" (
  "id" uuid not null default gen_random_uuid(),
  "title" character varying(64) not null,
  "description" text not null default ''::text,
  -- Lowest rank wins in the resolver. Unique, so two roles can never tie and
  -- leave the answer to whichever row the planner reached first.
  "rank" double precision,
  "color" character varying(7),

  "canModerate" boolean,
  "canManageRoles" boolean,
  "canManageSuspensions" boolean,
  "canViewAuditLog" boolean,
  "canCreateCredentials" boolean,
  "canManageVerification" boolean,

  -- Note the type: timestamp WITHOUT time zone, unlike every other timestamp in
  -- the platform schema. Changing it now would rewrite the table and reinterpret
  -- existing values as UTC.
  "createdAt" timestamp without time zone not null default now(),
  "roleType" platform."roleType" not null default 'custom'::platform."roleType",
  -- Whether holders show this role on their public profile.
  "showOnProfile" boolean not null default true,
  -- Marks a public-facing officer role. The homepage Leadership section is
  -- "every profile holding a role with isLeadership, ordered by that role's
  -- rank", which is the query roles_isLeadership_rank_idx below serves.
  "isLeadership" boolean not null default false,

  -- The Discord reconcile loop's columns. It writes "discordSyncedName" and
  -- "discordSyncedColor" on a timer, which is exactly why the refresh trigger in
  -- file 06 lists its columns instead of firing on any update.
  "discordRoleId" text,
  "discordSyncedName" text,
  "discordSyncedColor" integer,

  -- Attendance and export permissions. Three rather than one because the
  -- audiences differ: canExportStars downloads every member's email, and
  -- canTriggerSync is reachable from a button inside Airtable, where the
  -- audience is everyone with base access. All three gate the platform's
  -- surfaces only. Anyone with Airtable access can export the same data from the
  -- base directly and no Postgres permission can stop that.
  "canEditAttendance" boolean,
  "canExportStars" boolean,
  "canTriggerSync" boolean,

  -- Election permissions. canVoteAsOfficer casts the single officer ballot;
  -- canAuditBallots reads ballots belonging to teams other than your own. The
  -- ballot policies in file 17 call has_permission(uid, 'canAuditBallots'), and
  -- an unknown permission name resolves to false rather than erroring, so a
  -- missing column here denies every officer quietly.
  "canVoteAsOfficer" boolean,
  "canAuditBallots" boolean,

  constraint "roles_pkey" primary key ("id"),
  constraint "roles_title_key" unique ("title"),
  constraint "roles_rank_key" unique ("rank"),
  constraint "roles_discordRoleId_key" unique ("discordRoleId"),
  -- Ranked exactly when custom, unranked exactly when not. The 'default' and
  -- 'root' roles are outside the ordering because the resolver special-cases
  -- them; a ranked 'root' row would place the all-permissions role somewhere in
  -- the middle of the ladder.
  constraint "roles_custom_requires_rank"
    check ((("roleType" = 'custom'::platform."roleType") = ("rank" is not null)))
);

alter table "platform"."roles" enable row level security;

-- Partial index for the homepage Leadership query. The join starts from
-- "userRoles", so the index that matters is the one that finds leadership roles
-- in rank order cheaply.
create index "roles_isLeadership_rank_idx"
  on "platform"."roles" ("rank")
  where "isLeadership";


-- ============================================================
-- credentialRoles
-- ============================================================
--
-- A shared login's roles. Both sides cascade: deleting a credential or a role
-- should not leave an assignment pointing at nothing.

create table "platform"."credentialRoles" (
  "credentialId" uuid not null,
  "roleId" uuid not null,

  constraint "credentialRoles_pkey" primary key ("credentialId", "roleId"),
  constraint "credentialRoles_credentialId_credentials_id_fkey"
    foreign key ("credentialId") references platform."credentials"("id") on delete cascade,
  constraint "credentialRoles_roleId_roles_id_fkey"
    foreign key ("roleId") references platform."roles"("id") on delete cascade
);

alter table "platform"."credentialRoles" enable row level security;


-- ============================================================
-- userRoles
-- ============================================================
--
-- A member's roles. This is the table the permission resolver reads, and the
-- table both refresh triggers in file 06 watch. Both foreign keys cascade, so
-- deleting an auth.users row or a role also fires those triggers.

create table "platform"."userRoles" (
  "userId" uuid not null,
  "roleId" uuid not null,

  constraint "userRoles_pkey" primary key ("userId", "roleId"),
  constraint "userRoles_userId_users_id_fkey"
    foreign key ("userId") references auth.users("id") on delete cascade,
  constraint "userRoles_roleId_roles_id_fkey"
    foreign key ("roleId") references platform."roles"("id") on delete cascade
);

alter table "platform"."userRoles" enable row level security;

-- At most one person holds Root. The uuid is hardcoded here and hardcoded again
-- in the root_holders CTE of the "resolvedUserPermissions" body in file 06.
-- Nothing ties the two together, no foreign key and no constant, so a change to
-- one is a change to both. Getting them out of step means the singleton is
-- enforced on a role the resolver no longer treats as root.
create unique index "userRoles_root_singleton"
  on platform."userRoles" ("roleId")
  where ("roleId" = '00000000-0000-0000-0000-000000000002'::uuid);


-- ============================================================
-- Policies
-- ============================================================
--
-- Which half is load-bearing, because it is not the obvious one: RLS is on and
-- three of these four tables have no PERMISSIVE policy at all, and that absence
-- is what denies today. The restrictive `using (false)` policies below add
-- nothing on their own. What they buy is that a permissive policy added later,
-- by someone who wanted to open one narrow read, cannot open the table. Delete
-- either half and the table is still closed. Delete both and the next permissive
-- policy anyone writes is the whole door.
--
-- The four verbs are written as four separate policies rather than one
-- `for all using (false)` on purpose. `for all` covers SELECT too, and the one
-- table here that needs a readable SELECT is roles.
--
-- Policy names repeat across tables throughout this schema. That is deliberate:
-- the name says what the policy does, and the table it is attached to says what
-- it does it to.

-- credentials: closed to every client, on every verb. Reads happen with the
-- service key.
create policy "crud_public_policy_delete"
  on "platform"."credentials"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."credentials"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."credentials"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."credentials"
  as restrictive
  for update
  to public
using (false)
with check (false);

-- credentialRoles: same, and for the same reason. Knowing which roles the club
-- email holds is knowing what the club email can do.
create policy "crud_public_policy_delete"
  on "platform"."credentialRoles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."credentialRoles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."credentialRoles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."credentialRoles"
  as restrictive
  for update
  to public
using (false)
with check (false);

-- roles is the one readable table of the four, and only to `authenticated`. The
-- permission columns are readable along with everything else: what a role can do
-- is public information among members, and the access control is the permission
-- itself, not the secrecy of the catalogue. Roles are still written only through
-- the service key.
--
-- These restrictive policies name `authenticated`, so they do not apply to anon.
-- anon is denied by having no permissive policy at all, which means any
-- public-facing page that shows leadership roles has to read them from
-- somewhere with more privilege than the anon key.
--
-- A fifth policy, "deny_test_identities", is added to this table in file 06 and
-- narrows the SELECT below.
create policy "crud_authenticated_policy_delete"
  on "platform"."roles"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."roles"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."roles"
  as permissive
  for select
  to authenticated
using (true);

create policy "crud_authenticated_policy_update"
  on "platform"."roles"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

-- userRoles: closed on every verb. A client that could write here could grant
-- itself Root, and a client that could read it could enumerate the officers.
-- Assignment goes through the service key.
create policy "crud_public_policy_delete"
  on "platform"."userRoles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."userRoles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."userRoles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."userRoles"
  as restrictive
  for update
  to public
using (false)
with check (false);
