-- Elections: the ballots teams and officers cast to rank each other's work.
--
-- Lands after the teams migration, which supplies the keys these reference.
-- There is no RPC migration -- casting a ballot and recording a tally are
-- server actions over Drizzle.

create type "platform"."electionElectorate" as enum ('teams', 'officers');
create type "platform"."electionPurpose"    as enum ('points', 'tiebreak');
create type "platform"."electionStatus"     as enum
  ('draft', 'open', 'closed', 'tallied');

-- ============================================================
-- Elections
-- ============================================================
create table "platform"."elections" (
  "id"               uuid not null default gen_random_uuid(),
  "competitionId"    uuid not null,
  "slug"             text not null,
  "title"            text not null,
  "electorate"       "platform"."electionElectorate" not null,
  "purpose"          "platform"."electionPurpose" not null default 'points',
  "opensAt"          timestamptz not null,
  "closesAt"         timestamptz not null,
  "status"           "platform"."electionStatus" not null default 'draft',
  -- Null for the tiebreak, which the tally generates rather than an officer
  -- authoring it in Airtable.
  "airtableRecordId" text,

  constraint "elections_pkey" primary key ("id"),
  constraint "elections_competitionId_slug_key" unique ("competitionId", "slug"),
  constraint "elections_airtableRecordId_key" unique ("airtableRecordId"),
  -- Denormalization target: see the note on ballots below.
  constraint "elections_id_electorate_key" unique ("id", "electorate"),
  constraint "elections_closesAt_after_opensAt" check ("closesAt" > "opensAt"),
  -- A tiebreak is always an officer decision. Teams never break their own tie.
  constraint "elections_tiebreak_is_officers"
    check ("purpose" = 'points' or "electorate" = 'officers'),
  constraint "elections_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on update cascade on delete cascade
);

alter table "platform"."elections" enable row level security;

-- At most one tiebreak per competition.
create unique index "elections_one_tiebreak_per_competition"
  on "platform"."elections" ("competitionId") where "purpose" = 'tiebreak';

-- ============================================================
-- Ballots
-- ============================================================
--
-- A ballot is cast either by a team or by an officer on behalf of all
-- officers, never both -- and which one it is follows from the ELECTION, one
-- table away.
--
-- A check constraint cannot read another table, so written against `ballots`
-- alone the rule has nothing to test. That is how the obvious spelling ends up
-- being a constraint that can never fail:
--
--   check (num_nonnulls("teamId") <= 1)   -- one argument, so always true
--
-- Copying `electorate` onto the ballot gives the check both halves of the
-- comparison, and the composite foreign key into elections(id, electorate)
-- keeps the copy honest -- a ballot cannot claim an electorate its election
-- does not have. Same move as "competitionId" on teamMembers.
--
-- `on update cascade` is deliberate: an electorate should not change once
-- ballots exist, but if one is corrected before voting opens the ballots
-- should follow rather than block the correction.
create table "platform"."ballots" (
  "id"          uuid not null default gen_random_uuid(),
  "electionId"  uuid not null,
  "electorate"  "platform"."electionElectorate" not null,
  "teamId"      uuid,
  "castBy"      uuid not null,
  "castAt"      timestamptz not null default now(),

  constraint "ballots_pkey" primary key ("id"),
  constraint "ballots_electorate_matches_teamId" check (
    ("electorate" = 'teams'    and "teamId" is not null) or
    ("electorate" = 'officers' and "teamId" is null)
  ),
  constraint "ballots_electionId_fkey" foreign key ("electionId")
    references "platform"."elections"("id") on delete cascade,
  constraint "ballots_electionId_electorate_fkey"
    foreign key ("electionId", "electorate")
    references "platform"."elections"("id", "electorate") on update cascade,
  constraint "ballots_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on delete cascade,
  constraint "ballots_castBy_fkey" foreign key ("castBy")
    references "auth"."users"("id")
);

alter table "platform"."ballots" enable row level security;

-- One ballot per team in a team election...
create unique index "ballots_one_per_team_per_election"
  on "platform"."ballots" ("electionId", "teamId") where "teamId" is not null;
-- ...and exactly one ballot in an officer election.
create unique index "ballots_one_officer_ballot_per_election"
  on "platform"."ballots" ("electionId") where "teamId" is null;

-- ============================================================
-- Rankings
-- ============================================================
--
-- Ballots must be complete: exactly one row per candidate. A partial ballot
-- would silently distort a Borda sum rather than fail, so completeness is
-- asserted at write time by the action -- the primary key here only stops the
-- same rank being used twice.
create table "platform"."ballotRankings" (
  "ballotId"        uuid not null,
  "rank"            smallint not null,
  "candidateTeamId" uuid not null,

  constraint "ballotRankings_pkey" primary key ("ballotId", "rank"),
  constraint "ballotRankings_one_row_per_candidate"
    unique ("ballotId", "candidateTeamId"),
  constraint "ballotRankings_rank_positive" check ("rank" >= 1),
  constraint "ballotRankings_ballotId_fkey" foreign key ("ballotId")
    references "platform"."ballots"("id") on delete cascade,
  constraint "ballotRankings_candidateTeamId_fkey" foreign key ("candidateTeamId")
    references "platform"."teams"("id") on delete cascade
);

alter table "platform"."ballotRankings" enable row level security;

-- ============================================================
-- RLS
-- ============================================================

-- Which elections exist, and when they open, is public.
create policy "public_select" on "platform"."elections"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."elections"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."elections"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."elections"
  as restrictive for delete to anon, authenticated using (false);

-- Your own team's ballot, or any ballot if you hold canAuditBallots. Ballot
-- privacy is the point of the narrow read: a member who can see how other
-- teams ranked them can retaliate, and the tally does not need the reader's
-- help.
create policy "own_team_or_auditor_select" on "platform"."ballots"
  as permissive for select to authenticated
  using (
    "platform".has_permission((select auth.uid()), 'canAuditBallots')
    or exists (
      select 1 from "platform"."teamMembers" tm
       where tm."teamId" = "platform"."ballots"."teamId"
         and tm."userId" = (select auth.uid())
    )
  );
create policy "no_client_insert" on "platform"."ballots"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."ballots"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."ballots"
  as restrictive for delete to anon, authenticated using (false);

create policy "own_team_or_auditor_select" on "platform"."ballotRankings"
  as permissive for select to authenticated
  using (
    exists (
      select 1 from "platform"."ballots" b
       where b."id" = "platform"."ballotRankings"."ballotId"
         and (
           "platform".has_permission((select auth.uid()), 'canAuditBallots')
           or exists (
             select 1 from "platform"."teamMembers" tm
              where tm."teamId" = b."teamId"
                and tm."userId" = (select auth.uid())
           )
         )
    )
  );
create policy "no_client_insert" on "platform"."ballotRankings"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."ballotRankings"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."ballotRankings"
  as restrictive for delete to anon, authenticated using (false);
