CREATE VIEW "platform"."memberStars" WITH (security_invoker=on) AS  SELECT a."userId",
    'meeting'::text AS "activityType",
    m.id AS "activityId",
    m.id AS "meetingId",
    NULL::uuid AS "competitionId",
    m."startsAt",
    a."recordedAt" AS "earnedAt",
    false AS won
   FROM (platform.attendance a
     JOIN platform.meetings m ON ((m.id = a."meetingId")))
  WHERE (platform.meeting_has_workshop(m.id) AND (m."cancelledAt" IS NULL) AND (m."deletedAt" IS NULL))
UNION ALL
 SELECT tm."userId",
    'competition'::text AS "activityType",
    c.id AS "activityId",
    NULL::uuid AS "meetingId",
    c.id AS "competitionId",
    min(ce."openedAt") AS "startsAt",
    min(ce."openedAt") AS "earnedAt",
    bool_or((ce."mergedAt" IS NOT NULL)) AS won
   FROM ((platform."competitionEntries" ce
     JOIN platform.competitions c ON ((c.id = ce."competitionId")))
     JOIN platform."teamMembers" tm ON (((tm."teamId" = ce."teamId") AND (tm."joinedAt" <= ce."openedAt") AND ((tm."leftAt" IS NULL) OR (tm."leftAt" > ce."openedAt")))))
  WHERE ((c."closedAt" IS NULL) OR (ce."openedAt" < c."closedAt"))
  GROUP BY tm."userId", c.id;

REVOKE ALL ON TABLE "platform"."memberStars" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."memberStars" TO "postgres", "service_role";
