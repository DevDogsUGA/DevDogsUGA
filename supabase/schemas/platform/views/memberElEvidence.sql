CREATE VIEW "platform"."memberElEvidence" WITH (security_invoker=on) AS  SELECT w."userId",
    'workshop'::text AS "evidenceType",
    w."reflectionId" AS "evidenceId",
    w."meetingId",
    NULL::uuid AS "projectId",
    w.title,
    w."activityOn",
    w.hours,
    w.words
   FROM ( SELECT DISTINCT ON (r."userId", r."workshopDefinitionId") r."userId",
            r.id AS "reflectionId",
            m.id AS "meetingId",
            COALESCE(ws.title, ws.project, ws."definitionId") AS title,
            ((m."startsAt" AT TIME ZONE 'America/New_York'::text))::date AS "activityOn",
            ws."elHours" AS hours,
            platform.word_count(r.content) AS words
           FROM ((((platform.reflections r
             JOIN platform.attendance a ON (((a."userId" = r."userId") AND (a."meetingId" = r."meetingId"))))
             JOIN platform.meetings m ON (((m.id = r."meetingId") AND (m."cancelledAt" IS NULL) AND (m."deletedAt" IS NULL))))
             JOIN platform.workshops ws ON (((ws."meetingId" = m.id) AND (ws."definitionId" = r."workshopDefinitionId") AND (ws."deletedAt" IS NULL))))
             CROSS JOIN platform."reflectionSettings" s)
          WHERE ((r."submittedAt" IS NOT NULL) AND (r."workshopDefinitionId" IS NOT NULL) AND (platform.word_count(r.content) >= GREATEST(s."minimumWordCount", 100)) AND (r."submittedAt" <= (GREATEST(m."endsAt", a."recordedAt") + make_interval(days => s."submissionWindowDays"))))
          ORDER BY r."userId", r."workshopDefinitionId", m."startsAt", r.id) w
UNION ALL
 SELECT pr."userId",
    'project_report'::text AS "evidenceType",
    pr.id AS "evidenceId",
    NULL::uuid AS "meetingId",
    pr."projectId",
    p.name AS title,
    pr."endDate" AS "activityOn",
    pr."approvedHours" AS hours,
    platform.word_count(pr.content) AS words
   FROM (platform."projectReports" pr
     JOIN platform.projects p ON ((p.id = pr."projectId")))
  WHERE ((pr.status = 'approved'::text) AND (pr."approvedHours" IS NOT NULL));

COMMENT ON VIEW "platform"."memberElEvidence" IS 'Server-only. The EL (experiential learning) evidence the club can vouch for, one row per item: a workshop (the member attended a meeting that ran it, submitted a qualifying reflection naming it, at least 100 words and inside the window of one week from when attendance was recorded or the meeting ended, whichever is later; hours are the workshop definition''s elHours copied onto platform.workshops) or an approved project report (hours the reviewer confirmed). A workshop counts once per member even if it ran on several nights. Read by the /attendance summary and by the officers'' EL evidence export, so both agree on what is verified. Account deletion: the view holds nothing of its own; it empties as the member''s reflections, attendance and reports go.';

REVOKE ALL ON TABLE "platform"."memberElEvidence" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."memberElEvidence" TO "postgres", "service_role";
