-- Tally output: per-election results, the pairwise matrix behind the Copeland
-- step, what the officer tiebreak discloses, and the standings that combine
-- requirement points with election points.

-- ============================================================
-- Election results
-- ============================================================
create table "platform"."electionResults" (
  "electionId" uuid not null,
  "teamId"     uuid not null,
  -- Ties share a placement, so this is not dense: two teams at 2 means the
  -- next team is at 4.
  "placement"  smallint not null,
  "bordaScore" integer not null,
  -- bordaScore / (V x (n-1)), in [0,1]. Scaling is what lets elections with
  -- different voter counts and different team counts contribute comparable
  -- points.
  "scaled"     numeric(10,9) not null,

  constraint "electionResults_pkey" primary key ("electionId", "teamId"),
  constraint "electionResults_scaled_range" check ("scaled" >= 0 and "scaled" <= 1),
  constraint "electionResults_placement_positive" check ("placement" >= 1),
  constraint "electionResults_electionId_fkey" foreign key ("electionId")
    references "platform"."elections"("id") on delete cascade,
  constraint "electionResults_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on delete cascade
);

alter table "platform"."electionResults" enable row level security;

-- ============================================================
-- Pairwise tallies
-- ============================================================
--
-- The matrix behind the Copeland step, kept so a disputed tiebreak can be
-- replayed rather than re-argued.
create table "platform"."pairwiseTallies" (
  "competitionId" uuid not null,
  "teamA"         uuid not null,
  "teamB"         uuid not null,
  "aOverB"        integer not null,
  "bOverA"        integer not null,

  constraint "pairwiseTallies_pkey" primary key ("competitionId", "teamA", "teamB"),
  constraint "pairwiseTallies_distinct_teams" check ("teamA" <> "teamB"),
  constraint "pairwiseTallies_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on delete cascade
);

alter table "platform"."pairwiseTallies" enable row level security;

-- ============================================================
-- Tiebreak disclosures
-- ============================================================
--
-- The officer tiebreak ballot discloses ONE COMPARISON, not an ordering: for
-- each tied pair, which team the officers placed higher. Publishing the full
-- officer ballot would leak an opinion about every team including the ones
-- whose placement was never in question.
create table "platform"."tiebreakDisclosures" (
  "competitionId" uuid not null,
  "higherTeamId"  uuid not null,
  "lowerTeamId"   uuid not null,

  constraint "tiebreakDisclosures_pkey"
    primary key ("competitionId", "higherTeamId", "lowerTeamId"),
  constraint "tiebreakDisclosures_distinct_teams"
    check ("higherTeamId" <> "lowerTeamId"),
  constraint "tiebreakDisclosures_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on delete cascade,
  constraint "tiebreakDisclosures_higherTeamId_fkey" foreign key ("higherTeamId")
    references "platform"."teams"("id") on delete cascade,
  constraint "tiebreakDisclosures_lowerTeamId_fkey" foreign key ("lowerTeamId")
    references "platform"."teams"("id") on delete cascade
);

alter table "platform"."tiebreakDisclosures" enable row level security;

-- ============================================================
-- Competition standings
-- ============================================================
--
-- The two requirement counts are COPIED here, not joined. Standings are a
-- published result, and a later correction to a team's grade must not silently
-- rewrite the arithmetic behind a competition that already announced a winner
-- -- it should produce a visible re-tally. Storing the inputs alongside the
-- output is what makes "550 out of 600" reproducible from the row itself.
create table "platform"."competitionStandings" (
  "competitionId"     uuid not null,
  "teamId"            uuid not null,
  "requirementsMet"   smallint not null,
  "requirementCount"  smallint not null,
  "requirementPoints" integer not null,
  "electionPoints"    integer not null,
  "totalPoints"       integer generated always as
                        ("requirementPoints" + "electionPoints") stored,
  "placement"         smallint not null,
  -- Which STEP decided this placement: 'points' | 'copeland' | 'officer-tiebreak'.
  -- When a team asks why it placed second, the answer should be a stored fact
  -- rather than a re-derivation.
  "resolvedBy"        text,

  constraint "competitionStandings_pkey" primary key ("competitionId", "teamId"),
  constraint "competitionStandings_met_within_count"
    check ("requirementsMet" <= "requirementCount"),
  constraint "competitionStandings_total_in_range"
    check ("totalPoints" between 0 and 1000),
  constraint "competitionStandings_placement_positive" check ("placement" >= 1),
  constraint "competitionStandings_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on delete cascade,
  constraint "competitionStandings_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on delete cascade
);

alter table "platform"."competitionStandings" enable row level security;

-- ============================================================
-- Lifetime points per member
-- ============================================================
--
-- A member's points are their teams' points. Derived, so it is a view -- the
-- same rule that governs stars.
--
-- `security_invoker = on` is load-bearing rather than boilerplate. Views run
-- as their owner by default, which would make this one a hole straight through
-- the competitionStandings policy that hides standings until a tally lands --
-- publishing a running total mid-tally, and with it the shape of an
-- unannounced result. With invoker semantics the view sums only rows the
-- reader may already see.
--
-- Joining on "teamId" alone cannot double-count: teamMembers carries
-- unique ("userId", "competitionId"), so a member holds at most one team per
-- competition and contributes to at most one standings row per competition.
--
-- Deliberately not a ranking. Competitions vary in team count and difficulty,
-- and a member who competed five times outscores a stronger member who
-- competed twice. Fine for a profile badge, wrong for anything that decides
-- something.
create view "platform"."memberPoints"
with (security_invoker = on) as
select
  tm."userId",
  sum(st."totalPoints")::bigint as "lifetimePoints",
  -- Not needed for the total. It is here because the total's obvious
  -- complaint -- that it rewards showing up often more than doing well -- is
  -- answered by a per-competition average, and that average should not need a
  -- second view.
  count(*)::integer             as "competitionsScored"
from "platform"."teamMembers" tm
join "platform"."competitionStandings" st on st."teamId" = tm."teamId"
group by tm."userId";

-- Profile renders are the only read path and they are all keyed by user.
create index "teamMembers_userId_teamId_idx"
  on "platform"."teamMembers" ("userId", "teamId");

-- ============================================================
-- RLS
-- ============================================================

-- Results are readable once the election is tallied, so a partial count never
-- leaks mid-tally.
--
-- The tiebreak election writes NO electionResults rows at all, so there is
-- nothing here for a policy to have to exclude. That is asserted in the tally
-- and in a test rather than encoded here -- a rule that depends on nobody
-- adding the obvious insert later is not a rule.
create policy "tallied_select" on "platform"."electionResults"
  as permissive for select to anon, authenticated
  using (
    exists (
      select 1 from "platform"."elections" e
       where e."id" = "platform"."electionResults"."electionId"
         and e."status" = 'tallied'
    )
  );
create policy "no_client_insert" on "platform"."electionResults"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."electionResults"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."electionResults"
  as restrictive for delete to anon, authenticated using (false);

-- Officers only: the matrix says how every team ranked every other team, which
-- is the ballot privacy the disclosure table exists to avoid breaking.
create policy "auditor_select" on "platform"."pairwiseTallies"
  as permissive for select to authenticated
  using ("platform".has_permission((select auth.uid()), 'canAuditBallots'));
create policy "no_client_insert" on "platform"."pairwiseTallies"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."pairwiseTallies"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."pairwiseTallies"
  as restrictive for delete to anon, authenticated using (false);

-- This IS the disclosure surface, so it is public by construction.
create policy "public_select" on "platform"."tiebreakDisclosures"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."tiebreakDisclosures"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."tiebreakDisclosures"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."tiebreakDisclosures"
  as restrictive for delete to anon, authenticated using (false);

-- "Once the competition is finalized" reads here as "once its points election
-- has been tallied". There is no `finalized` flag on competitions, and adding
-- one would be a second thing that can disagree with the tally; the tally is
-- what writes these rows and what flips that status, so it is the honest
-- gate. Interpretation worth revisiting if a competition ever needs standings
-- published without an election.
create policy "finalized_select" on "platform"."competitionStandings"
  as permissive for select to anon, authenticated
  using (
    exists (
      select 1 from "platform"."elections" e
       where e."competitionId" = "platform"."competitionStandings"."competitionId"
         and e."purpose" = 'points'
         and e."status" = 'tallied'
    )
  );
create policy "no_client_insert" on "platform"."competitionStandings"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."competitionStandings"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."competitionStandings"
  as restrictive for delete to anon, authenticated using (false);
