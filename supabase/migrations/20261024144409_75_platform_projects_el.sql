SET local check_function_bodies = off;

CREATE TABLE "platform"."projectMembers" (
  "projectId" uuid                     NOT NULL,
  "userId"    uuid                     NOT NULL,
  "addedBy"   uuid,
  "addedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectMembers_pkey" PRIMARY KEY ("projectId", "userId")
);

ALTER TABLE "platform"."projectMembers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "platform"."projectReportContributions" (
  "reportId"       uuid NOT NULL,
  "contributionId" uuid NOT NULL,
  CONSTRAINT "projectReportContributions_contributionId_key" UNIQUE ("contributionId"),
  CONSTRAINT "projectReportContributions_pkey" PRIMARY KEY ("reportId", "contributionId")
);

ALTER TABLE "platform"."projectReportContributions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "platform"."projectReports" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"        uuid                     NOT NULL,
  "projectId"     uuid                     NOT NULL,
  "startDate"     date                     NOT NULL,
  "endDate"       date                     NOT NULL,
  "hours"         numeric(5,2)             NOT NULL,
  "content"       text                     NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'submitted'::text,
  "approvedHours" numeric(5,2),
  "reviewedBy"    uuid,
  "reviewedAt"    timestamp with time zone,
  "reviewNote"    text,
  "submittedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectReports_approvedHours_range" CHECK ((("approvedHours" IS NULL) OR (("approvedHours" > (0)::numeric) AND ("approvedHours" <= (200)::numeric)))),
  CONSTRAINT "projectReports_approved_shape" CHECK ((((status = 'approved'::text) = ("approvedHours" IS NOT NULL)) AND ((status = 'submitted'::text) = ("reviewedAt" IS NULL)))),
  CONSTRAINT "projectReports_dates_order" CHECK (("endDate" >= "startDate")),
  CONSTRAINT "projectReports_hours_range" CHECK (((hours > (0)::numeric) AND (hours <= (200)::numeric))),
  CONSTRAINT "projectReports_pkey" PRIMARY KEY (id),
  CONSTRAINT "projectReports_returned_note" CHECK (((status <> 'returned'::text) OR (char_length(btrim(COALESCE("reviewNote", ''::text))) > 0))),
  CONSTRAINT "projectReports_status_choices" CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'returned'::text])))
);

ALTER TABLE "platform"."projectReports"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "platform"."projects" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "description" text,
  "repos"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"      text                     NOT NULL DEFAULT 'proposed'::text,
  "advisorId"   uuid,
  "proposedBy"  uuid,
  "approvedBy"  uuid,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "decidedAt"   timestamp with time zone,
  "updatedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projects_description_length" CHECK (((description IS NULL) OR (char_length(description) <= 1000))),
  CONSTRAINT "projects_name_length" CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 80))),
  CONSTRAINT "projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "projects_repos_count" CHECK ((cardinality(repos) <= 10)),
  CONSTRAINT "projects_status_choices" CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'declined'::text, 'archived'::text])))
);

ALTER TABLE "platform"."projects"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform.word_count (
  content text
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select cardinality(array_remove(
    regexp_split_to_array(
      content,
      E'[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+'
    ),
    ''
  ));
$function$;

ALTER TABLE "platform"."projectMembers"
  ADD CONSTRAINT "projectMembers_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."projectMembers"
  ADD CONSTRAINT "projectMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."projectReportContributions"
  ADD CONSTRAINT "projectReportContributions_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES platform.contributions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."projectReportContributions"
  ADD CONSTRAINT "projectReportContributions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES platform."projectReports"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."projectReports"
  ADD CONSTRAINT "projectReports_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."projectReports"
  ADD CONSTRAINT "projectReports_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."projects"
  ADD CONSTRAINT "projects_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."projects"
  ADD CONSTRAINT "projects_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "platform"."projectMembers"
  ADD CONSTRAINT "projectMembers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES platform.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "platform"."projectReports"
  ADD CONSTRAINT "projectReports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES platform.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "platform"."projects"
  ADD CONSTRAINT "projects_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

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
          WHERE ((r."submittedAt" IS NOT NULL) AND (r."workshopDefinitionId" IS NOT NULL) AND (platform.word_count(r.content) >= GREATEST(s."minimumWordCount", 100)) AND (r."submittedAt" <= (GREATEST(m."endsAt", a."recordedAt") + make_interval(days => GREATEST(s."submissionWindowDays", 7)))))
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

CREATE INDEX "projectMembers_userId_idx" ON platform."projectMembers" USING btree ("userId");

CREATE INDEX "projectReports_projectId_status_idx" ON platform."projectReports" USING btree ("projectId", status);

CREATE INDEX "projectReports_userId_idx" ON platform."projectReports" USING btree ("userId", "submittedAt" DESC);

CREATE INDEX "projects_advisorId_idx" ON platform.projects USING btree ("advisorId")
  WHERE ("advisorId" IS NOT NULL);

CREATE UNIQUE INDEX projects_name_key ON platform.projects USING btree (lower(btrim(name)));

CREATE INDEX projects_status_idx ON platform.projects USING btree (status);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectMembers"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectMembers"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectMembers"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectMembers"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectReportContributions"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projectReports"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_delete" ON "platform"."projects"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."projects"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."projects"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."projects"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "platform"."projectReports"."approvedHours" IS 'Set exactly when status is approved: the hours the reviewer confirmed or adjusted. This, not "hours", is what the evidence export counts.';

COMMENT ON COLUMN "platform"."projectReports"."hours" IS 'The hours the member claims, actual participation, in quarter-hour steps by convention (not enforced).';

COMMENT ON COLUMN "platform"."projects"."advisorId" IS 'The member who keeps the project''s member list and reviews its reports. Null until leadership assigns one, and again after the advisor''s account is deleted.';

COMMENT ON COLUMN "platform"."projects"."status" IS 'proposed (awaiting leadership), active, declined, archived. Only an active project takes members and reports.';

COMMENT ON TABLE "platform"."projectMembers" IS 'Server-only. Who works on a project; kept by the project''s advisor (or leadership). Account deletion: the member''s rows are deleted with the account (ON DELETE CASCADE); "addedBy" is set null when the adder''s account goes.';

COMMENT ON TABLE "platform"."projectReportContributions" IS 'Server-only. The merged pull requests (platform.contributions) a project report cites as evidence. A pull request belongs to at most one report (UNIQUE on "contributionId"), so the same work cannot be claimed twice; deleting a report frees its pull requests. The server checks that each one is the report author''s own and was merged inside the report''s date range. Account deletion: rows go with the report (ON DELETE CASCADE from "reportId") and with the contribution (ON DELETE CASCADE), so deleting the account removes them either way.';

COMMENT ON TABLE "platform"."projectReports" IS 'Server-only. A member''s report of independent project work for EL credit: a date range, the actual hours they claim, merged pull requests as evidence (platform."projectReportContributions") and a reflection of at least 100 words. An advisor of the project or any leadership member (never the author) approves it, optionally adjusting the hours, or returns it with a note; the author can then edit and resubmit. Only approved hours reach the EL evidence export. Account deletion: the member''s reports are deleted with the account (ON DELETE CASCADE, Q168) because EL evidence goes to UGAHacks through officer exports; "reviewedBy" is set null when the reviewer''s account goes. Hours already credited to a workshop must not be claimed again; the reviewer checks.';

COMMENT ON TABLE "platform"."projects" IS 'Server-only. A long-lived DevDogs project that members can report independent work on for EL credit (Q119, Q123, Q170). A member proposes one (status proposed); leadership approves it in the console (active) and assigns an advisor, or declines it. "repos" are "owner/name" strings and carry no access: repository permissions are set in GitHub. There is no recruitment flow; the advisor keeps the member list in platform."projectMembers". Account deletion: a project outlives the people on it. A deleted advisor leaves "advisorId" null (ON DELETE SET NULL) so the project is waiting for a new one, not gone; "proposedBy" and "approvedBy" are likewise set null.';

COMMENT ON VIEW "platform"."memberElEvidence" IS 'Server-only. The EL (experiential learning) evidence the club can vouch for, one row per item: a workshop (the member attended a meeting that ran it, submitted a qualifying reflection naming it, at least 100 words and inside a window of at least one week (never less, whatever the setting) from when attendance was recorded or the meeting ended, whichever is later; hours are the workshop definition''s elHours copied onto platform.workshops) or an approved project report (hours the reviewer confirmed). A workshop counts once per member even if it ran on several nights. Read by the /attendance summary and by the officers'' EL evidence export, so both agree on what is verified. Account deletion: the view holds nothing of its own; it empties as the member''s reflections, attendance and reports go.';

REVOKE ALL ON FUNCTION "platform"."word_count"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "platform"."word_count"(text) TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectMembers" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectReportContributions" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectReports" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projects" TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."memberElEvidence" TO "postgres", "service_role";

ALTER TABLE "platform"."projectReports"
  ADD CONSTRAINT "projectReports_content_words" CHECK ((platform.word_count(content) >= 100));

REVOKE ALL ON TABLE "platform"."projectMembers" FROM "anon";

REVOKE ALL ON TABLE "platform"."projectMembers" FROM "authenticated";

REVOKE ALL ON TABLE "platform"."projectReportContributions" FROM "anon";

REVOKE ALL ON TABLE "platform"."projectReportContributions" FROM "authenticated";

REVOKE ALL ON TABLE "platform"."projectReports" FROM "anon";

REVOKE ALL ON TABLE "platform"."projectReports" FROM "authenticated";

REVOKE ALL ON TABLE "platform"."projects" FROM "anon";

REVOKE ALL ON TABLE "platform"."projects" FROM "authenticated";

REVOKE ALL ON TABLE "platform"."memberElEvidence" FROM "anon";

REVOKE ALL ON TABLE "platform"."memberElEvidence" FROM "authenticated";
