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
-- (at the 2026-11-01 export: 3 teams, 3 members, 2 requests, 3 competitions,
-- 0 entries; the manifest is the source of truth, and `node
-- scripts/archive-teams-and-competitions.ts --check` must pass immediately
-- before this applies). Nothing else in the database referenced them:
-- `reflections` held no competition rows.
--
-- What goes, in order:
--   1. memberStars loses its competition branch, so the columns that existed
--      only for it ("competitionId", "won") go too. A view can't lose columns
--      in place, so it is dropped and created again with the same ACL.
--   2. publicProfiles loses "showCompetitions".
--   3. profile loses that column (and its column grants with it).
--   4. reflections and reflectionRevisions lose "competitionId", and the
--      "exactly one activity" check becomes "meetingId is not null".
--   5. The five tables, then the helper function their policy used, then the
--      three enums.
--   6. The rate-limit hits the team actions left behind.

-- 1. memberStars: meetings only.
drop view "platform"."memberStars";

CREATE VIEW "platform"."memberStars" WITH (security_invoker=on) AS  SELECT a."userId",
    'meeting'::text AS "activityType",
    m.id AS "activityId",
    m.id AS "meetingId",
    m."startsAt",
    a."recordedAt" AS "earnedAt"
   FROM (platform.attendance a
     JOIN platform.meetings m ON ((m.id = a."meetingId")))
  WHERE (platform.meeting_has_workshop(m.id) AND (m."cancelledAt" IS NULL) AND (m."deletedAt" IS NULL));

REVOKE ALL ON TABLE "platform"."memberStars" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."memberStars" TO "postgres", "service_role";

-- 2. publicProfiles: without the retired competitions switch.
drop view "platform"."publicProfiles";

CREATE VIEW "platform"."publicProfiles" AS  SELECT p."userId",
    p.handle,
        CASE
            WHEN p."showName" THEN p."preferredName"
            ELSE NULL::character varying
        END AS "displayName",
    (p."showAvatar" AND (EXISTS ( SELECT 1
           FROM storage.objects o
          WHERE ((o.bucket_id = 'avatars'::text) AND (o.name = (p."userId")::text))))) AS "hasAvatar",
        CASE
            WHEN p."showBio" THEN p.bio
            ELSE NULL::character varying
        END AS bio,
        CASE
            WHEN p."showBio" THEN p."roleDescription"
            ELSE NULL::character varying
        END AS "roleDescription",
        CASE
            WHEN p."showGithub" THEN ( SELECT lower((i.identity_data ->> 'user_name'::text)) AS lower
               FROM auth.identities i
              WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))
            ELSE NULL::text
        END AS "githubHandle",
        CASE
            WHEN p."showDiscord" THEN ( SELECT (i.identity_data ->> 'full_name'::text)
               FROM auth.identities i
              WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text)))
            ELSE NULL::text
        END AS "discordHandle",
        CASE
            WHEN p."showLinkedin" THEN ( SELECT (i.identity_data ->> 'name'::text)
               FROM auth.identities i
              WHERE ((i.user_id = p."userId") AND (i.provider = 'linkedin_oidc'::text)))
            ELSE NULL::text
        END AS "linkedinName",
    p."showName",
    p."showAvatar",
    p."showBio",
    p."showLinks",
    p."showContributions",
    p."showStars",
    p."graduationYear",
    ARRAY( SELECT m.name
           FROM ( SELECT ap.name,
                    min(pap."sortOrder") AS ord
                   FROM (platform."profileAcademicPrograms" pap
                     JOIN platform."academicPrograms" ap ON ((ap.id = pap."programId")))
                  WHERE ((pap."userId" = p."userId") AND (ap.category = ANY (ARRAY['undergraduate_major'::platform."academicProgramCategory", 'graduate_major'::platform."academicProgramCategory"])))
                  GROUP BY ap.name) m
          ORDER BY m.ord) AS majors,
    (EXISTS ( SELECT 1
           FROM (platform."userRoles" ur
             JOIN platform.roles r ON ((r.id = ur."roleId")))
          WHERE ((ur."userId" = p."userId") AND r."isLeadership"))) AS "isLeadership"
   FROM (platform.profile p
     JOIN platform."profileWithVerification" v ON ((v."userId" = p."userId")))
  WHERE (v.verified AND p."publicProfile" AND (p.handle IS NOT NULL) AND (p."quarantinedBy" IS NULL) AND (NOT platform.is_suspended(p."userId")) AND (NOT (EXISTS ( SELECT 1
           FROM platform."accountDeletions" d
          WHERE (d."userId" = p."userId")))));

REVOKE ALL ON TABLE "platform"."publicProfiles" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."publicProfiles" TO "postgres", "service_role";

COMMENT ON VIEW "platform"."publicProfiles" IS 'The one definition of a public member profile. Server-only (no anon/authenticated grant). Hidden fields are NULL. Never add legal/involvement names, emails or attendance. graduationYear and majors (major categories only, never minors or certificates) are public whenever the profile is (Q103).';

-- 3. profile: the retired competitions switch.
alter table "platform"."profile"
  drop column "showCompetitions";

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
