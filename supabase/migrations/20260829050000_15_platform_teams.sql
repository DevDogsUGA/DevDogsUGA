-- Teams, their rosters, and the invitations and join requests that fill them.
--
-- Creates two enums (teamRole, membershipDirection, membershipRequestStatus)
-- and three tables. The enums live here because these three tables are their
-- only consumers.
--
-- The one thing to know before editing: a team is not scoped to a
-- competition any more (see the platform redesign's teams-core step). GitHub
-- is the source of truth -- a team IS a branch, `team/<slug>`, and membership
-- IS push access to it, granted through a GitHub team and a branch ruleset
-- (server/github/teamSync.ts + rulesets.ts). What lives here is the mirror:
-- Postgres's copy of that state, plus `teamMembershipRequests`, the one thing
-- GitHub cannot hold (a pending invite or join request).
--
-- This file must run after events core, which creates platform.competitions
-- (no longer referenced by these tables, but "team_awards" in the next file
-- still points at both).

create type "platform"."teamRole" as enum ('lead', 'member');
create type "platform"."membershipDirection" as enum ('invite', 'request');
create type "platform"."membershipRequestStatus" as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

-- ============================================================
-- Teams
-- ============================================================
--
-- A team is a persistent project team, not a per-competition roster: it
-- outlives any single competition it enters, and it exists independently of
-- one ever happening. There is no lock here for the same reason. The old
-- schema derived a roster lock from a live pull-request entry and a
-- competition's judging clock; neither concept survives the git-native
-- rework. The only ceilings left are membership caps (a contributor on at
-- most `MAX_CONCURRENT_TEAMS_PER_USER` teams, a team at most
-- `MAX_TEAM_SIZE` members -- both in server/teams/limits.ts), enforced in the
-- platform actions rather than in a stored column.
create table "platform"."teams" (
  "id"              uuid not null default gen_random_uuid(),
  -- Globally unique, not per-competition: it names the branch,
  -- `team/<slug>`, and the branch lives for as long as the team does.
  "slug"            text not null,
  "name"            text not null,
  -- Never exposed to clients; see the grants at the bottom of this file.
  "joinCode"        text not null,
  -- No foreign key, here or on the other audit columns in this file: the team
  -- outlives the account that created it, and a cascade from auth.users would
  -- delete a team's identity along with one member's account.
  "createdBy"       uuid not null,
  "acceptingRequests" boolean not null default true,

  constraint "teams_pkey" primary key ("id"),
  constraint "teams_slug_key" unique ("slug")
);

alter table "platform"."teams" enable row level security;

-- ============================================================
-- Team members
-- ============================================================
--
-- Keeps HISTORY. `joinedAt`/`leftAt` is deliberately not a hard delete on
-- leave: a later competition step derives competition stars from who was on
-- a team at some past moment, and a hard delete on leave would make that
-- question unanswerable the day after somebody left. Active membership is
-- `"leftAt" is null`; every other predicate in this codebase that means
-- "on the team right now" reads that column, not the row's mere existence.
create table "platform"."teamMembers" (
  "id"            uuid not null default gen_random_uuid(),
  "teamId"        uuid not null,
  "userId"        uuid not null,
  "role"          "platform"."teamRole" not null default 'member',
  "joinedAt"      timestamptz not null default now(),
  "leftAt"        timestamptz,

  constraint "teamMembers_pkey" primary key ("id"),

  constraint "teamMembers_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on update cascade on delete cascade,
  constraint "teamMembers_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on update cascade on delete cascade
);

alter table "platform"."teamMembers" enable row level security;

-- At most one ACTIVE stint per (team, member). A member who left and later
-- rejoins gets a second row, not a revived first one -- that is what makes
-- "history" mean something here rather than just being an unused column.
create unique index "teamMembers_one_active_per_team_user"
  on "platform"."teamMembers" ("teamId", "userId") where "leftAt" is null;

-- Exactly one ACTIVE lead per team. Partial on both `role` and `leftAt`, so a
-- lead who left does not block the team from ever having a lead again.
create unique index "teamMembers_one_lead_per_team"
  on "platform"."teamMembers" ("teamId") where "role" = 'lead' and "leftAt" is null;

-- Serves the cap check in requireCanJoin (how many teams is this member
-- active on right now) and, later, the memberStars view. Partial, since every
-- caller of this index is asking about ACTIVE membership.
create index "teamMembers_userId_active_idx"
  on "platform"."teamMembers" ("userId") where "leftAt" is null;

comment on column "platform"."teamMembers"."leftAt" is
  'Null while the member is active. Set once, on leave; a rejoin is a new row, not a cleared one. Active membership is "leftAt is null" everywhere this table is read.';

-- ============================================================
-- Invitations and join requests
-- ============================================================
--
-- One table with a `direction`, not two tables. They differ in who initiates
-- and who may respond; everything else, the target team, the target member,
-- expiry, the notification, the response audit, is identical. Two tables would
-- duplicate all of it and then need a union everywhere both are shown.
create table "platform"."teamMembershipRequests" (
  "id"            uuid not null default gen_random_uuid(),
  "teamId"        uuid not null,
  "userId"        uuid not null,
  "direction"     "platform"."membershipDirection" not null,
  "createdBy"     uuid not null,
  -- Requests only: a member asking to join can say why. An invitation carries
  -- no message, which is why this is nullable rather than defaulted.
  "message"       text,
  "status"        "platform"."membershipRequestStatus" not null default 'pending',
  "createdAt"     timestamptz not null default now(),
  -- Set when the notification email is accepted by Cloudflare. Null with a
  -- 'pending' status means the email has not gone out yet, which is what the
  -- retry pass looks for.
  "notifiedAt"    timestamptz,
  "respondedAt"   timestamptz,
  -- Like "createdBy" above, deliberately without a foreign key: the audit row
  -- has to survive the responder's account being deleted.
  "respondedBy"   uuid,
  "expiresAt"     timestamptz,

  constraint "teamMembershipRequests_pkey" primary key ("id"),
  constraint "teamMembershipRequests_responded_together"
    check (("respondedAt" is null) = ("respondedBy" is null)),
  constraint "teamMembershipRequests_pending_unresponded"
    check ("status" <> 'pending' or "respondedAt" is null),

  constraint "teamMembershipRequests_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on update cascade on delete cascade,
  constraint "teamMembershipRequests_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on update cascade on delete cascade
);

alter table "platform"."teamMembershipRequests" enable row level security;

-- One live approach per (team, member) in either direction. Partial so that a
-- declined invitation does not block a later request: people change their
-- minds, and the historical rows are what the audit trail is made of.
create unique index "teamMembershipRequests_one_pending_per_team_user"
  on "platform"."teamMembershipRequests" ("teamId", "userId")
  where "status" = 'pending';

-- Drives the retry pass that sends notifications that have not gone out.
create index "teamMembershipRequests_unnotified"
  on "platform"."teamMembershipRequests" ("createdAt")
  where "status" = 'pending' and "notifiedAt" is null;

-- ============================================================
-- RLS
-- ============================================================
--
-- Writes are denied to every client on all three tables. Joining a team is a
-- database write, a GitHub permission change and an email; only the first of
-- those can happen in Postgres, so the whole operation is a server action and
-- there is no client write path to allow.
--
-- The deny is three per-command restrictive policies rather than one
-- `for all using (false)`, because the `for all` form would also kill the
-- SELECT policy sitting next to it.

-- Teams are listed to logged-out visitors: finding one to join does not
-- require an account.
create policy "public_select" on "platform"."teams"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."teams"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teams"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teams"
  as restrictive for delete to anon, authenticated using (false);

-- `joinCode` is the one column that policy must not reach, and a row policy
-- cannot express "every column but one", so it is a column grant.
--
-- The design note for this table reads "anon: name, slug; authenticated:
-- all". Taken literally the second half hands every signed-in member the
-- join code of every team in the club, which is the entire secret the code
-- consists of. Both roles are therefore held to the same column set, and the
-- code is served to the team's own members through a loader that checks
-- membership. Drizzle connects as the owner and is not subject to these
-- grants.
--
-- The revoke and the grant are a pair. Dropping the revoke restores the
-- schema-wide default privileges from the first migration, which include
-- "joinCode"; adding "joinCode" to the grant list does the same thing more
-- directly.
revoke select on "platform"."teams" from anon, authenticated;
grant select (
  "id", "slug", "name", "createdBy", "acceptingRequests"
) on "platform"."teams" to anon, authenticated;

-- Whether `uid` is an ACTIVE member of `team_id`, for the history policy
-- below. Security definer, and specifically NOT a plain subquery inlined into
-- that policy: a subquery on `teamMembers` inside a policy ON `teamMembers` is
-- self-referencing, and Postgres evaluates every one of the table's own
-- policies -- including the one being defined -- against each row the
-- subquery scans. That recurses into itself and fails with 42P17, "infinite
-- recursion detected in policy for relation teamMembers"; measured against
-- this exact policy locally. Security definer runs this function's body as
-- its owner, which bypasses RLS entirely, so the lookup never re-triggers
-- policy evaluation. `set search_path = ''` is mandatory alongside it, per
-- `has_permission` above: nothing here may resolve through a caller-controlled
-- schema.
create or replace function "platform".is_active_team_member(team_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from "platform"."teamMembers"
    where "teamId" = team_id and "userId" = uid and "leftAt" is null
  );
$$;

-- Rosters are public to signed-in members: the team page shows who is on each
-- team, and hiding that would make the club less legible for no gain. Not
-- public to `anon`, because it is a membership list keyed to real accounts.
--
-- `"leftAt" is null` keeps this to the CURRENT roster. `teamMembers` now keeps
-- history (a leave sets `leftAt` rather than deleting the row) so a later
-- competition step can derive stars from who was on a team when it entered,
-- but that history is not the design note's "who is on each team" -- it is
-- every departed member's join/leave timeline, on every team, readable by
-- any signed-in account. Past stints stay restricted to the team's own
-- members below.
create policy "authenticated_select" on "platform"."teamMembers"
  as permissive for select to authenticated
  using ("leftAt" is null);

-- Past stints (`"leftAt" is not null`) are visible only to the team's own
-- current members -- the same membership check `teamMembershipRequests` uses
-- above, rewritten through `is_active_team_member` to dodge the recursion
-- explained on it -- rather than to every signed-in account.
create policy "team_member_select_history" on "platform"."teamMembers"
  as permissive for select to authenticated
  using (
    "leftAt" is not null
    and "platform".is_active_team_member("teamId", (select auth.uid()))
  );
create policy "no_client_insert" on "platform"."teamMembers"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teamMembers"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teamMembers"
  as restrictive for delete to anon, authenticated using (false);

-- Your own approaches, plus every approach aimed at a team you are ACTIVELY
-- on. `"leftAt" is null` is what keeps a departed member from still seeing the
-- queue on a team they no longer lead.
create policy "own_or_team_select" on "platform"."teamMembershipRequests"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "userId"
    or exists (
      select 1 from "platform"."teamMembers" tm
       where tm."teamId" = "platform"."teamMembershipRequests"."teamId"
         and tm."userId" = (select auth.uid())
         and tm."leftAt" is null
    )
  );
create policy "no_client_insert" on "platform"."teamMembershipRequests"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teamMembershipRequests"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teamMembershipRequests"
  as restrictive for delete to anon, authenticated using (false);
