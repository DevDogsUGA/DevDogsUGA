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
where a."revokedAt" is null
  and m."countsTowardProgress"
  and m."cancelledAt" is null
  and m."deletedAt" is null

union all

select
  tm."userId",
  'competition'::text as "activityType",
  c."id" as "activityId",
  null::uuid as "meetingId",
  c."id" as "competitionId",
  opening_meeting."startsAt" as "startsAt",
  coalesce(t."participationOverrideAt", t."competedAt", c."judgingStartsAt") as "earnedAt",
  exists (
    select 1
    from "platform"."teamAwards" aw
    where aw."teamId" = t."id" and aw."category" = 'winner'
  ) as "won"
from "platform"."teamMembers" tm
join "platform"."teams" t on t."id" = tm."teamId"
join "platform"."competitions" c on c."id" = t."competitionId"
join "platform"."workshops" w on w."id" = c."workshopId"
join "platform"."meetings" opening_meeting on opening_meeting."id" = w."meetingId"
where coalesce(t."participationOverride", t."competedAt" is not null)
  and c."countsTowardProgress"
  and c."deletedAt" is null
  and w."deletedAt" is null
  and opening_meeting."deletedAt" is null;

revoke all on "platform"."memberStars" from anon, authenticated;
