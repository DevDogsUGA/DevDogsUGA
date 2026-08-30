-- Teams, their rosters, and the invitations and join requests that fill them.
--
-- Creates four enums (teamRole, submissionState, membershipDirection,
-- membershipRequestStatus) and three tables. The enums live here because these
-- three tables are their only consumers.
--
-- The one thing to know before editing: every constraint name in this file is
-- an FK target or an application reference somewhere else. teams_id_competitionId_key
-- is what teamMembers, teamAwards and teamMembershipRequests point at, and
-- teamMembers_teamId_userId_role_key is what the sandbox layer's composite FK
-- points at. Renaming either one breaks a later migration, not this file.
--
-- This file must run after events core, which creates platform.competitions,
-- and before the sandbox environments file.

create type "platform"."teamRole" as enum ('lead', 'member');
create type "platform"."submissionState" as enum ('open', 'closed', 'merged');
create type "platform"."membershipDirection" as enum ('invite', 'request');
create type "platform"."membershipRequestStatus" as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

-- ============================================================
-- Teams
-- ============================================================
--
-- The four submission columns are one state machine, and the reason they are
-- FOUR rather than the two that look sufficient is the only subtle thing in
-- this file.
--
-- The obvious design is a single `submittedAt`, used both to lock the roster
-- and to mark the team as having competed. It breaks on what happens after
-- judging: the winning PR is merged and every other PR is CLOSED. If the star
-- reads "has an open PR", closing the losers retroactively erases the
-- participation of every team that did not win, silently, days later, and in a
-- way nobody would connect to the cleanup that caused it.
--
-- So the two questions get two columns:
--
--   "submissionState"  follows the PR forever      (open -> merged, or -> closed)
--   "competedAt"       frozen once at judging      (never cleared)
--
-- and the derived predicates read:
--
--   locked   = "submissionState" in ('open', 'merged')
--           or now() >= competitions."judgingStartsAt"
--           or "lockedManuallyAt" is not null
--   competed = "competedAt" is not null
--
-- Locking on the PR rather than on a deadline is deliberate: opening the PR is
-- the team's official entry, so that is the moment the roster should stop
-- moving. Deleting the PR before judging unlocks it again, which is why
-- `locked` is derived rather than stored.
create table "platform"."teams" (
  "id"              uuid not null default gen_random_uuid(),
  "competitionId"   uuid not null,
  "slug"            text not null,
  "name"            text not null,
  -- Never exposed to clients; see the grants at the bottom of this file.
  "joinCode"        text not null,
  -- No foreign key, here or on the other audit columns in this file: the team
  -- outlives the account that created it, and a cascade from auth.users would
  -- delete a competition's history along with a member.
  "createdBy"       uuid not null,

  "submissionUrl"   text,
  "submittedAt"     timestamptz,
  "submissionState" "platform"."submissionState",
  "competedAt"      timestamptz,

  -- Officer override for the case the automatic rules get wrong.
  "lockedManuallyAt" timestamptz,
  -- null = not yet graded. Officers fill this in through Airtable.
  "requirementsMet"  smallint,
  "acceptingRequests" boolean not null default true,
  -- Re-forming for the next competition copies the roster and records where it
  -- came from, so "the same team" is visible across weeks without teams being
  -- long-lived entities that span competitions.
  "clonedFromTeamId" uuid,

  constraint "teams_pkey" primary key ("id"),
  constraint "teams_competitionId_slug_key" unique ("competitionId", "slug"),
  -- Denormalized composite key, existing only so teamMembers, teamAwards and
  -- teamMembershipRequests can carry "competitionId" and have the database
  -- reject a row whose team belongs to a different competition.
  constraint "teams_id_competitionId_key" unique ("id", "competitionId"),

  constraint "teams_requirementsMet_nonneg"
    check ("requirementsMet" is null or "requirementsMet" >= 0),
  -- A submission is all three columns or none of them.
  constraint "teams_submission_url_state_together"
    check (("submissionUrl" is null) = ("submissionState" is null)),
  constraint "teams_submission_url_submittedAt_together"
    check (("submissionUrl" is null) = ("submittedAt" is null)),
  -- A team cannot have competed without ever having had an entry.
  constraint "teams_competedAt_requires_submission"
    check ("competedAt" is null or "submissionUrl" is not null),

  constraint "teams_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on update cascade on delete cascade,
  constraint "teams_clonedFromTeamId_fkey" foreign key ("clonedFromTeamId")
    references "platform"."teams"("id") on update cascade on delete set null
);

alter table "platform"."teams" enable row level security;

-- ============================================================
-- Team members
-- ============================================================
create table "platform"."teamMembers" (
  "teamId"        uuid not null,
  "competitionId" uuid not null,
  "userId"        uuid not null,
  "role"          "platform"."teamRole" not null default 'member',
  "joinedAt"      timestamptz not null default now(),

  constraint "teamMembers_pkey" primary key ("teamId", "userId"),
  -- One team per member per competition. Denormalizing "competitionId" onto
  -- this row is what lets that be a unique constraint instead of a trigger:
  -- without the column the rule is "no two rows whose teams share a
  -- competition", which is not expressible as a constraint at all.
  constraint "teamMembers_userId_competitionId_key" unique ("userId", "competitionId"),
  -- FK target for sandbox environment ownership, which needs to name the lead
  -- of a specific team and have the database enforce that it IS the lead.
  constraint "teamMembers_teamId_userId_role_key" unique ("teamId", "userId", "role"),

  constraint "teamMembers_teamId_competitionId_fkey"
    foreign key ("teamId", "competitionId")
    references "platform"."teams"("id", "competitionId")
    on update cascade on delete cascade,
  constraint "teamMembers_userId_fkey" foreign key ("userId")
    references "auth"."users"("id") on update cascade on delete cascade
);

alter table "platform"."teamMembers" enable row level security;

-- Exactly one lead per team. Partial rather than a plain unique on
-- ("teamId", "role"), which would also allow only one MEMBER per team.
create unique index "teamMembers_one_lead_per_team"
  on "platform"."teamMembers" ("teamId") where "role" = 'lead';

-- Serves the memberStars and memberPoints views in the two files after this
-- one. Profile renders are the only read path and they are all keyed by user.
create index "teamMembers_userId_teamId_idx"
  on "platform"."teamMembers" ("userId", "teamId");

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
  "competitionId" uuid not null,
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

  constraint "teamMembershipRequests_teamId_competitionId_fkey"
    foreign key ("teamId", "competitionId")
    references "platform"."teams"("id", "competitionId")
    on update cascade on delete cascade,
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

-- Teams are listed to logged-out visitors on the meetings page.
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
-- The design note for this table reads "anon: name, slug, competition;
-- authenticated: all". Taken literally the second half hands every signed-in
-- member the join code of every team in the club, which is the entire secret
-- the code consists of. Both roles are therefore held to the same column set,
-- and the code is served to the team's own members through a loader that
-- checks membership. Drizzle connects as the owner and is not subject to these
-- grants.
--
-- The revoke and the grant are a pair. Dropping the revoke restores the
-- schema-wide default privileges from the first migration, which include
-- "joinCode"; adding "joinCode" to the grant list does the same thing more
-- directly. Thirteen columns is the whole list, and it is complete.
revoke select on "platform"."teams" from anon, authenticated;
grant select (
  "id", "competitionId", "slug", "name", "createdBy",
  "submissionUrl", "submittedAt", "submissionState", "competedAt",
  "lockedManuallyAt", "requirementsMet", "acceptingRequests", "clonedFromTeamId"
) on "platform"."teams" to anon, authenticated;

-- Rosters are public to signed-in members: the team page shows who is on each
-- team, and hiding that would make the club less legible for no gain. Not
-- public to `anon`, because it is a membership list keyed to real accounts.
create policy "authenticated_select" on "platform"."teamMembers"
  as permissive for select to authenticated using (true);
create policy "no_client_insert" on "platform"."teamMembers"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teamMembers"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teamMembers"
  as restrictive for delete to anon, authenticated using (false);

-- Your own approaches, plus every approach aimed at a team you are on. The
-- second half is what lets a lead see the queue they are meant to act on.
create policy "own_or_team_select" on "platform"."teamMembershipRequests"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "userId"
    or exists (
      select 1 from "platform"."teamMembers" tm
       where tm."teamId" = "platform"."teamMembershipRequests"."teamId"
         and tm."userId" = (select auth.uid())
    )
  );
create policy "no_client_insert" on "platform"."teamMembershipRequests"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teamMembershipRequests"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teamMembershipRequests"
  as restrictive for delete to anon, authenticated using (false);
