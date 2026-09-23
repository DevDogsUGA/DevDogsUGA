-- Team awards and member stars: platform."teamAwards" and the platform."memberStars" view.
--
-- The one thing to know: stars are never stored. "memberStars" derives every
-- star from attendance rows, team membership and the winner award, so it reads
-- platform."attendance", platform."teamMembers", platform."teams",
-- platform."competitions" and platform."workshops". A `create view` body
-- resolves its relations at create time, so this file has to run after both the
-- attendance file and the teams file. That is the whole reason awards are not
-- folded into either of them.
--
-- ⚠️ The competition branch below is a STUB. The platform redesign's
-- teams-core step dropped "teams"."competitionId" and "teams"."competedAt" --
-- a team is no longer scoped to one competition, so "which members
-- participated in this competition" is no longer a question team membership
-- can answer. The branch is kept shape-compatible (same columns, same types)
-- so the view still compiles and every existing reader still gets a
-- `UNION ALL` of two branches, but it is filtered to return zero rows. The
-- platform redesign's competitions step rewires this to the competition-entry
-- mirror (collaborator on a team-branch that entered before the competition's
-- issue closed) once that mirror exists. Until then every star this view
-- produces is a meeting star.

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
-- What is stored is teams."competedAt", because "did this team have a live
-- entry at the moment judging began" stops being answerable the instant the
-- losing PRs are closed. That is a question about a past moment, so it is
-- frozen once and never recomputed.
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

-- The stub described above: shape-compatible, always empty. `tm` and `c` are
-- real tables so this compiles, but nothing joins them to each other or to
-- team membership, and `where false` guarantees it returns nothing regardless.
select
  tm."userId",
  'competition'::text as "activityType",
  c."id" as "activityId",
  null::uuid as "meetingId",
  c."id" as "competitionId",
  c."judgingStartsAt" as "startsAt",
  c."judgingStartsAt" as "earnedAt",
  false as "won"
from "platform"."teamMembers" tm
cross join "platform"."competitions" c
where false;

revoke all on "platform"."memberStars" from anon, authenticated;
