-- Side awards, and the view that derives every star from them.

-- ============================================================
-- Team awards
-- ============================================================
--
-- 'winner' is the category the star system reads; everything else
-- ('honorable-mention', 'best-design', whatever a semester invents) is a free
-- text label officers author in Airtable. Text rather than an enum precisely
-- because the set changes -- an enum would make inventing a category a
-- migration.
create table "platform"."teamAwards" (
  "id"            uuid not null default gen_random_uuid(),
  "teamId"        uuid not null,
  "competitionId" uuid not null,
  "category"      text not null,
  -- One line on why, shown on the hall of fame.
  "citation"      text,
  "mergedPrUrl"   text,
  -- No foreign key: the award outlives the officer's account.
  "awardedBy"     uuid not null,
  "awardedAt"     timestamptz not null default now(),

  constraint "teamAwards_pkey" primary key ("id"),
  constraint "teamAwards_teamId_competitionId_fkey"
    foreign key ("teamId", "competitionId")
    references "platform"."teams"("id", "competitionId")
    on update cascade on delete cascade
);

alter table "platform"."teamAwards" enable row level security;

-- At most one winner per competition. Partial, because every other category
-- may repeat -- several teams can share an honourable mention.
create unique index "teamAwards_one_winner_per_competition"
  on "platform"."teamAwards" ("competitionId") where "category" = 'winner';

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
-- Stars are DERIVED, never stored. The rule the whole model follows: derive
-- what is a question about now, store what is a question about a moment that
-- has passed. "Did this member earn a workshop star" is a question about
-- facts already in the ledger, so a stored copy could only ever disagree with
-- them -- and would, the first time an officer corrected a roster.
--
-- What IS stored is `teams."competedAt"`, because "did this team have a live
-- entry at the moment judging began" stops being answerable the instant the
-- losing PRs are closed. That is a question about a past moment, so it is
-- frozen once and never recomputed.
--
-- `security_invoker = on` matters here rather than being boilerplate. Without
-- it the view runs as its owner and returns every member's stars to any client
-- that selects from it, straight through the own-rows-only policy on
-- attendance. With it, a client sees exactly what its own policies allow, and
-- the officer-facing reads go through Drizzle as the owning role instead.
create view "platform"."memberStars"
with (security_invoker = on) as
with participation as (
  -- Attended the workshop.
  select
    a."userId",
    a."workshopId",
    true  as attended,
    false as competed,
    false as won
  from "platform"."attendance" a
  where a."workshopId" is not null

  union all

  -- Competed: had a live entry when judging began.
  select
    tm."userId",
    c."workshopId",
    false,
    true,
    false
  from "platform"."teamMembers" tm
  join "platform"."teams" t        on t."id" = tm."teamId"
  join "platform"."competitions" c on c."id" = t."competitionId"
  where t."competedAt" is not null

  union all

  -- Won.
  select
    tm."userId",
    c."workshopId",
    false,
    false,
    true
  from "platform"."teamMembers" tm
  join "platform"."teams" t         on t."id" = tm."teamId"
  join "platform"."competitions" c  on c."id" = t."competitionId"
  join "platform"."teamAwards" aw   on aw."teamId" = t."id" and aw."category" = 'winner'
)
select
  p."userId",
  p."workshopId",
  w."meetingId",
  w."projectId",
  -- Competing implies the workshop star even without an attendance row: a
  -- member who shipped a feature that week was demonstrably participating,
  -- and the check-in code is the thing most likely to have been missed.
  bool_or(p.attended or p.competed) as "workshopStar",
  bool_or(p.competed)               as "competitionStar",
  bool_or(p.won)                    as "won"
from participation p
join "platform"."workshops" w on w."id" = p."workshopId"
group by p."userId", p."workshopId", w."meetingId", w."projectId";
