SET local check_function_bodies = off;

DROP VIEW "platform"."memberStars";

CREATE OR REPLACE FUNCTION platform.meeting_has_workshop (
  meeting_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from "platform"."workshops" w
    where w."meetingId" = meeting_id
      and w."definitionId" is not null
      and w."deletedAt" is null
  );
$function$;

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

REVOKE ALL ON FUNCTION "platform"."meeting_has_workshop"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."meeting_has_workshop"(uuid) TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."memberStars" TO "postgres", "service_role";


REVOKE ALL ON FUNCTION "platform"."meeting_has_workshop"(uuid) FROM "anon";

REVOKE ALL ON FUNCTION "platform"."meeting_has_workshop"(uuid) FROM "authenticated";

REVOKE ALL ON TABLE "platform"."memberStars" FROM "anon";

REVOKE ALL ON TABLE "platform"."memberStars" FROM "authenticated";
