-- Competition entries and member stars:
-- platform."competitionEntries" and the platform."memberStars" view.
--
-- The one thing to know: stars are never stored. "memberStars" derives every
-- star from attendance rows, team membership and competition entries, so it
-- reads platform."attendance", platform."teamMembers", platform."teams",
-- platform."competitions" and platform."competitionEntries". A `create view`
-- body resolves its relations at create time, so this file has to run after
-- the attendance file, the events-core file (which creates
-- platform.competitions) and the teams file. That is the whole reason
-- entries are not folded into any of them.
--
-- ## Competition participation
--
-- A team is not scoped to one competition. "competitionEntries" is the
-- participation mirror: one row per entry pull request, created by the
-- `pull_request` webhook handling in `server/github/prEvent.ts` (nothing in
-- `server/github/competitions.ts` writes to it, since an entry is a fact
-- about a PR, not about the competition issue).
--
-- Participation is "held an active membership on the entering team, at the
-- moment the entry opened, and the entry opened before the competition's
-- issue closed (or it is still open)": exactly `teamMembers."joinedAt"`/
-- `"leftAt"` compared against `competitionEntries."openedAt"`.
--
-- ## Winning, without a `teamAwards` table
--
-- The lifecycle is "kickoff -> teams open PRs -> an officer merges the
-- winning PR -> issue closed", and a MERGE is already a fact GitHub records
-- and this table already mirrors (`competitionEntries."mergedAt"`) -- a
-- second, officer-authored table recording the same outcome by hand would be
-- one more place for the truth to live, and the two could disagree (an
-- officer awarding 'winner' to a team whose PR never actually merged, or
-- forgetting to record a merge everyone could already see on GitHub). Winner
-- is simply `competitionEntries."mergedAt" is not null` -- see the star view
-- below.

-- ============================================================
-- Competition entries
-- ============================================================
--
-- One row per entry: a pull request from a team's branch that links a
-- competition's issue, recognized and kept current by
-- `server/github/prEvent.ts`'s `pull_request` webhook handling and the
-- nightly `github-reconcile` backstop (`reconcileEntries`, for still-open
-- competitions).
--
-- The lifecycle this table exists to answer: a team enters by opening the PR
-- ("openedAt"), and any PR still open when the issue closes without being
-- merged lost. "closedAt" is a PR closed-without-merge, kept distinct from
-- "mergedAt" so "did this PR resolve, and how" is one row's own history
-- rather than inferred from the competition's `closedAt` and a null merge
-- time, which cannot tell "still open" from "closed unmerged" apart.
-- "mergedAt" is also this table's answer to "who won" -- see this file's
-- header on why there is no separate award table for that any more.
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
-- star's `earnedAt`, and `bool_or` over "mergedAt is not null" means one
-- MERGED qualifying entry is enough even if an unrelated later entry from
-- the same team did not itself carry the win -- see this file's header on
-- why winning is `competitionEntries."mergedAt"` now, not a separate award.
select
  tm."userId",
  'competition'::text as "activityType",
  c."id" as "activityId",
  null::uuid as "meetingId",
  c."id" as "competitionId",
  min(ce."openedAt") as "startsAt",
  min(ce."openedAt") as "earnedAt",
  bool_or(ce."mergedAt" is not null) as "won"
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
