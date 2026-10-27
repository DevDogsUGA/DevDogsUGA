CREATE VIEW "platform"."memberStars" WITH (security_invoker=on) AS  SELECT a."userId",
    'meeting'::text AS "activityType",
    m.id AS "activityId",
    m.id AS "meetingId",
    m."startsAt",
    a."recordedAt" AS "earnedAt"
   FROM (platform.attendance a
     JOIN platform.meetings m ON ((m.id = a."meetingId")))
  WHERE (m."countsForCredit" AND (m."cancelledAt" IS NULL) AND (m."deletedAt" IS NULL));

REVOKE ALL ON TABLE "platform"."memberStars" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."memberStars" TO "postgres", "service_role";
