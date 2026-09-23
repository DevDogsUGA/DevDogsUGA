-- Competition entries, team awards, and member stars:
-- platform."competitionEntries", platform."teamAwards" and the
-- platform."memberStars" view.
--
-- The one thing to know: stars are never stored. "memberStars" derives every
-- star from attendance rows, team membership, competition entries and the
-- winner award, so it reads platform."attendance", platform."teamMembers",
-- platform."teams", platform."competitions", platform."competitionEntries"
-- and platform."teamAwards". A `create view` body resolves its relations at
-- create time, so this file has to run after the attendance file, the
-- events-core file (which creates platform.competitions) and the teams file.
-- That is the whole reason awards and entries are not folded into any of
-- them.
--
-- ## Competition participation, finally wired up
--
-- The platform redesign's teams-core step dropped "teams"."competitionId" and
-- "teams"."competedAt" -- a team is no longer scoped to one competition -- and
-- stubbed the competition branch of "memberStars" to always return zero rows
-- until a mirror existed to answer "which members participated in this
-- competition". "competitionEntries" IS that mirror: one row per entry pull
-- request, created by a later step's `pull_request` webhook handling (nothing
-- in this step's `server/github/competitions.ts` writes to it, since an entry
-- is a fact about a PR, not about the competition issue). The view below reads
-- it regardless of when it gets populated -- an empty table produces the same
-- zero rows the old stub did, honestly, rather than a second stub layer.
--
-- Participation is "held an active membership on the entering team, at the
-- moment the entry opened, and the entry opened before the competition's
-- issue closed (or it is still open)": exactly `teamMembers."joinedAt"`/
-- `"leftAt"` compared against `competitionEntries."openedAt"`, which is what
-- that pair's own doc comment in the teams migration says a "later
-- competition step" would do.
--
-- Winning is still `teamAwards` with `category = 'winner'`, unchanged from
-- before this step -- an officer's own record of the outcome, with a
-- citation and the merged PR's URL, not something derived from
-- `competitionEntries."mergedAt"`. A merge is a fact about a PR;
-- `teamAwards` is the fact about a COMPETITION, and the two are written by
-- different actors at different times (GitHub, then whoever runs
-- `awardTeam`). Conflating them would make the star view wrong the instant
-- an officer merges a losing entry's cleanup commit or any other PR that
-- happens to link the issue without being the one that won.

-- ============================================================
-- Competition entries
-- ============================================================
--
-- One row per entry: a pull request from a team's branch that links a
-- competition's issue. Nothing in `server/github/competitions.ts` (this
-- step's ingestion module) writes here -- an entry is a fact about a PR, not
-- about the competition issue -- so this table starts empty and stays empty
-- until a later step's `pull_request` webhook handling populates it. The
-- schema lands now because `memberStars` below is written against it today
-- rather than against a second stub.
--
-- The lifecycle this table exists to answer: a team enters by opening the PR
-- ("openedAt"), and any PR still open when the issue closes without being
-- merged lost. "closedAt" is a PR closed-without-merge, kept distinct from
-- "mergedAt" so "did this PR resolve, and how" is one row's own history
-- rather than inferred from the competition's `closedAt` and a null merge
-- time, which cannot tell "still open" from "closed unmerged" apart.
-- "mergedAt" is a fact about the PR, not the platform's record of who WON --
-- see the star view below for why those are different columns on different
-- tables.
create table "platform"."competitionEntries" (
  "id"            uuid not null default gen_random_uuid(),
  "competitionId" uuid not null,
  "teamId"        uuid not null,
  "prNodeId"      text not null,
  "prNumber"      integer not null,
  "url"           text not null,
  "openedAt"      timestamptz not null,
  "mergedAt"      timestamptz,
  "closedAt"      timestamptz,
  constraint "competitionEntries_pkey" primary key ("id"),
  constraint "competitionEntries_prNodeId_key" unique ("prNodeId"),
  constraint "competitionEntries_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on update cascade on delete cascade,
  constraint "competitionEntries_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on update cascade on delete cascade
);

alter table "platform"."competitionEntries" enable row level security;

create index "competitionEntries_competitionId_idx"
  on "platform"."competitionEntries" ("competitionId");
create index "competitionEntries_teamId_idx"
  on "platform"."competitionEntries" ("teamId");

-- Entries are public (they are what the results page lists), writes are
-- server-only -- same four-policy shape as every other table in this file.
create policy "public_select" on "platform"."competitionEntries"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."competitionEntries"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."competitionEntries"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."competitionEntries"
  as restrictive for delete to anon, authenticated using (false);

-- ============================================================
-- Team awards
-- ============================================================
--
-- 'winner' is the category the star system reads. Everything else
-- ('honorable-mention', 'best-design', whatever a semester invents) is a free
-- text label officers author in Airtable. Text rather than an enum precisely
-- because the set changes: an enum would make inventing a category a migration.
create table "platform"."teamAwards" (
  "id"            uuid not null default gen_random_uuid(),
  "teamId"        uuid not null,
  "competitionId" uuid not null,
  "category"      text not null,
  -- One line on why, shown on the hall of fame.
  "citation"      text,
  "mergedPrUrl"   text,
  -- Nullable, and no foreign key. Nullable so a row survives an officer
  -- account being deleted rather than becoming unexplainable or having to
  -- fall back to a sentinel user. No FK for the same reason: the award
  -- outlives the officer's account.
  "awardedBy"     uuid,
  "awardedAt"     timestamptz not null default now(),

  constraint "teamAwards_pkey" primary key ("id"),
  -- Two plain FKs rather than the composite this used to be. The composite
  -- pointed at "teams"("id", "competitionId") to guarantee an award could
  -- never name a team from a different competition than the one it is
  -- scoped to -- a guarantee that made sense when a team belonged to
  -- exactly one competition. The platform redesign's teams-core step made
  -- teams persistent and competition-independent (a team is a git branch
  -- that can enter any number of competitions over its life), so
  -- "teams"("id", "competitionId") no longer exists to point at, and the
  -- guarantee itself no longer has a meaning: which competition an award is
  -- for is exactly what this row is recording, not something derivable from
  -- the team.
  constraint "teamAwards_teamId_fkey" foreign key ("teamId")
    references "platform"."teams"("id") on update cascade on delete cascade,
  constraint "teamAwards_competitionId_fkey" foreign key ("competitionId")
    references "platform"."competitions"("id") on update cascade on delete cascade
);

comment on column "platform"."teamAwards"."awardedBy" is
  'The officer who authored this award, via awardTeam. Nullable so a row survives that officer''s account being deleted.';

alter table "platform"."teamAwards" enable row level security;

-- At most one winner per competition. Partial, because every other category
-- may repeat: several teams can share an honourable mention.
create unique index "teamAwards_one_winner_per_competition"
  on "platform"."teamAwards" ("competitionId") where "category" = 'winner';

-- Awards are public, writes are server-only. The permissive select is what
-- makes the hall of fame render for a logged-out visitor; the restrictive trio
-- closes the insert, update and delete that the schema's default privileges
-- already granted to anon and authenticated. The trio is split per command
-- because `for all using (false)` would also kill the select above.
--
-- These four names repeat on other tables in this schema. Policy names are
-- scoped per table, so that is legal, and a pass that deduplicates them by name
-- deletes live policies.
create policy "public_select" on "platform"."teamAwards"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."teamAwards"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."teamAwards"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."teamAwards"
  as restrictive for delete to anon, authenticated using (false);

-- ============================================================
-- The star view
-- ============================================================
--
-- Stars are derived, never stored. A qualifying meeting attendance and a
-- qualifying competition participation are separate one-star facts.
--
-- What IS stored is `competitionEntries."openedAt"`, because "was this team's
-- entry live at the moment it opened" stops being answerable the instant
-- membership changes again -- that is a question about a past moment, and the
-- entry row freezes it the same way an attendance row freezes "who was in
-- the room".
--
-- The view is server-only. Member surfaces load a caller-filtered slice through
-- a server loader; granting it directly would expose competition participation
-- because team rosters are readable by every authenticated member.
create view "platform"."memberStars"
with (security_invoker = on) as
select
  a."userId",
  'meeting'::text as "activityType",
  m."id" as "activityId",
  m."id" as "meetingId",
  null::uuid as "competitionId",
  m."startsAt" as "startsAt",
  a."recordedAt" as "earnedAt",
  false as "won"
from "platform"."attendance" a
join "platform"."meetings" m on m."id" = a."meetingId"
where m."countsForCredit"
  and m."cancelledAt" is null
  and m."deletedAt" is null

union all

-- Competition participation, described at the top of this file. Grouped by
-- (member, competition) rather than left as one row per qualifying entry,
-- because a team that reopens an entry (a second PR after the first was
-- closed) must still earn its members exactly one star -- `memberStars` is a
-- set of one-star FACTS, and "the same fact twice" is not a second fact.
-- `min("openedAt")` picks the earliest qualifying entry's moment as the
-- star's `earnedAt`, and `bool_or` over the winner check means one winning
-- qualifying entry is enough even if an unrelated later entry from the same
-- team did not itself carry the win.
select
  tm."userId",
  'competition'::text as "activityType",
  c."id" as "activityId",
  null::uuid as "meetingId",
  c."id" as "competitionId",
  min(ce."openedAt") as "startsAt",
  min(ce."openedAt") as "earnedAt",
  bool_or(
    exists (
      select 1 from "platform"."teamAwards" ta
      where ta."competitionId" = c."id"
        and ta."teamId" = ce."teamId"
        and ta."category" = 'winner'
    )
  ) as "won"
from "platform"."competitionEntries" ce
join "platform"."competitions" c on c."id" = ce."competitionId"
-- Active membership AT THE MOMENT the entry opened, not membership now and
-- not membership ever: the history `teamMembers."joinedAt"`/`"leftAt"` keeps
-- is exactly what answers "was this member on the team when it entered".
join "platform"."teamMembers" tm
  on tm."teamId" = ce."teamId"
  and tm."joinedAt" <= ce."openedAt"
  and (tm."leftAt" is null or tm."leftAt" > ce."openedAt")
-- The entry has to have opened before the issue closed (or the issue is
-- still open). An entry opened after closing cannot happen through the
-- normal PR-linking flow, but the guard is cheap and the alternative is a
-- star for a PR opened against a competition that was already over.
where c."closedAt" is null or ce."openedAt" < c."closedAt"
group by tm."userId", c."id";

revoke all on "platform"."memberStars" from anon, authenticated;
