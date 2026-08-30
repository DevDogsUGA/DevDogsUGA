-- Team awards and member stars: platform."teamAwards" and the platform."memberStars" view.
--
-- The one thing to know: stars are never stored. "memberStars" derives every
-- star from attendance rows, team membership and the winner award, so it reads
-- platform."attendance", platform."teamMembers", platform."teams",
-- platform."competitions" and platform."workshops". A `create view` body
-- resolves its relations at create time, so this file has to run after both the
-- attendance file and the teams file. That is the whole reason awards are not
-- folded into either of them.

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
  -- Nullable, and no foreign key. Nullable because the 'winner' row is written
  -- by the tally, not authored by anyone, and every value a not-null column
  -- would force is a lie: a sentinel user, the team's own id, or whichever
  -- officer happened to trigger the cron. No FK because the award outlives the
  -- officer's account. Adding either one back breaks a real case.
  "awardedBy"     uuid,
  "awardedAt"     timestamptz not null default now(),

  constraint "teamAwards_pkey" primary key ("id"),
  -- Composite rather than a plain reference to teams("id"), so an award can
  -- never name a team from a different competition.
  constraint "teamAwards_teamId_competitionId_fkey"
    foreign key ("teamId", "competitionId")
    references "platform"."teams"("id", "competitionId")
    on update cascade on delete cascade
);

comment on column "platform"."teamAwards"."awardedBy" is
  'The officer who authored this award. Null means it was computed by the tally, which is the case for every category = ''winner'' row.';

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
-- Stars are derived, never stored. The rule the whole model follows: derive
-- what is a question about now, store what is a question about a moment that
-- has passed. "Did this member earn a workshop star" is a question about facts
-- already in the ledger, so a stored copy could only ever disagree with them,
-- and would, the first time an officer corrected a roster.
--
-- What is stored is teams."competedAt", because "did this team have a live
-- entry at the moment judging began" stops being answerable the instant the
-- losing PRs are closed. That is a question about a past moment, so it is
-- frozen once and never recomputed.
--
-- `security_invoker = on` is load-bearing, not boilerplate. Without it the view
-- runs as its owner and returns every member's stars to any client that selects
-- from it, straight through the own-rows-only policy on attendance. With it, a
-- client sees exactly what its own policies allow, and the officer-facing reads
-- go through Drizzle as the owning role instead.
--
-- The view carries workshops."projectId" through as a grouped column rather
-- than joining projects, so a workshop with no project flows through correctly.
-- The loader that reads this view is the piece that has to left-join projects.
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
