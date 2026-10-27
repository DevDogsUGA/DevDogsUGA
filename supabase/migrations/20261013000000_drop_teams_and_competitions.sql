-- Drops the Teams and competitions tables, and everything that only existed to
-- serve them.
--
-- DESTRUCTIVE, and hand-written on purpose: a generated declarative diff may
-- only add (Q10), and this one is the exception the destructive gate exists
-- for. It merges as its own deploy, AFTER the platform release that removed
-- every reader of these objects (the Teams and competitions pages, the GitHub
-- mirror, the stars and reflections queries that joined them) and after that
-- release's generated Drizzle schema stopped listing them. Applying it before
-- that release would break the running platform.
--
-- The rows are archived first: `archive/` holds the last state of every table
-- dropped here, and `archive/manifest.json` records production's row counts
-- (at the 2026-10-12 export: 3 teams, 3 members, 2 requests, 3 competitions,
-- 0 entries; the manifest is the source of truth, and `node
-- scripts/archive-teams-and-competitions.ts --check` must pass immediately
-- before this applies). Nothing else in the database referenced them:
-- `reflections` held no competition rows.
--
-- What goes, in order:
--   1. memberStars loses its competition branch, so the columns that existed
--      only for it ("competitionId", "won") go too. A view can't lose columns
--      in place, so it is dropped and created again with the same ACL.
--   2. publicProfiles loses "showCompetitions" and "showContributions".
--   3. profile loses those two columns (and their column grants with them).
--   4. reflections and reflectionRevisions lose "competitionId", and the
--      "exactly one activity" check becomes "meetingId is not null".
--   5. The five tables, then the helper function their policy used, then the
--      three enums.
--   6. The rate-limit hits the team actions left behind.

-- 1. memberStars: meetings only.
drop view "platform"."memberStars";

create view "platform"."memberStars" with (security_invoker = on) as
  select a."userId",
    'meeting'::text as "activityType",
    m.id as "activityId",
    m.id as "meetingId",
    m."startsAt",
    a."recordedAt" as "earnedAt"
  from platform.attendance a
    join platform.meetings m on m.id = a."meetingId"
  where m."countsForCredit" and m."cancelledAt" is null and m."deletedAt" is null;

revoke all on table "platform"."memberStars" from "anon", "authenticated";
grant all on table "platform"."memberStars" to "postgres", "service_role";

-- 2. publicProfiles: without the two retired switches.
drop view "platform"."publicProfiles";

create view "platform"."publicProfiles" as
  select p."userId",
    p.handle,
    case when p."showName" then p."preferredName" else null::character varying end as "displayName",
    (p."showAvatar" and (exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars'::text and o.name = (p."userId")::text
    ))) as "hasAvatar",
    case when p."showBio" then p.bio else null::character varying end as bio,
    case when p."showBio" then p."roleDescription" else null::character varying end as "roleDescription",
    case when p."showGithub" then (
      select lower(i.identity_data ->> 'user_name'::text) as lower
      from auth.identities i
      where i.user_id = p."userId" and i.provider = 'github'::text
    ) else null::text end as "githubHandle",
    case when p."showDiscord" then (
      select i.identity_data ->> 'full_name'::text
      from auth.identities i
      where i.user_id = p."userId" and i.provider = 'discord'::text
    ) else null::text end as "discordHandle",
    case when p."showLinkedin" then (
      select i.identity_data ->> 'name'::text
      from auth.identities i
      where i.user_id = p."userId" and i.provider = 'linkedin_oidc'::text
    ) else null::text end as "linkedinName",
    p."showName",
    p."showAvatar",
    p."showBio",
    p."showLinks",
    p."showStars"
  from platform.profile p
    join platform."profileWithVerification" v on v."userId" = p."userId"
  where v.verified and p."publicProfile" and p.handle is not null
    and p."quarantinedBy" is null and not platform.is_suspended(p."userId");

revoke all on table "platform"."publicProfiles" from "anon", "authenticated";
grant all on table "platform"."publicProfiles" to "postgres", "service_role";

comment on view "platform"."publicProfiles" is 'The one definition of a public member profile. Server-only (no anon/authenticated grant). Hidden fields are NULL. Never add legal/involvement names, emails or attendance.';

-- 3. profile: the retired switches.
alter table "platform"."profile"
  drop column "showCompetitions",
  drop column "showContributions";

-- 4. reflections: meetings only.
alter table "platform"."reflections"
  drop constraint "reflections_exactly_one_activity";
alter table "platform"."reflections"
  drop column "competitionId";
alter table "platform"."reflections"
  alter column "meetingId" set not null;

alter table "platform"."reflectionRevisions"
  drop constraint "reflectionRevisions_exactly_one_activity";
alter table "platform"."reflectionRevisions"
  drop column "competitionId";
alter table "platform"."reflectionRevisions"
  alter column "meetingId" set not null;

-- 5. The tables, dependents first. Their indexes, constraints and policies go
-- with them.
drop table "platform"."competitionEntries";
drop table "platform"."teamMembershipRequests";
drop table "platform"."teamMembers";
drop table "platform"."competitions";
drop table "platform"."teams";

drop function "platform"."is_active_team_member"(uuid, uuid);

drop type "platform"."teamRole";
drop type "platform"."membershipDirection";
drop type "platform"."membershipRequestStatus";

-- 6. Leftover counters from the team actions' rate limits.
delete from "platform"."rateLimitHits" where "scope" like 'team:%';
