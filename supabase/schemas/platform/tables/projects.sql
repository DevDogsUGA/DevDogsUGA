CREATE TABLE "platform"."projects" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "description" text,
  "repos"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"      text                     NOT NULL DEFAULT 'proposed',
  "advisorId"   uuid,
  "proposedBy"  uuid,
  "approvedBy"  uuid,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "decidedAt"   timestamp with time zone,
  "updatedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projects_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projects_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projects_description_length" CHECK (((description IS NULL) OR (char_length(description) <= 1000))),
  CONSTRAINT "projects_name_length" CHECK ((char_length(btrim(name)) BETWEEN 2 AND 80)),
  CONSTRAINT "projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "projects_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projects_repos_count" CHECK ((cardinality(repos) <= 10)),
  CONSTRAINT "projects_status_choices" CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'declined'::text, 'archived'::text])))
);

ALTER TABLE "platform"."projects"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "projects_name_key" ON platform.projects USING btree (lower(btrim(name)));

CREATE INDEX "projects_advisorId_idx" ON platform.projects USING btree ("advisorId")
  WHERE ("advisorId" IS NOT NULL);

CREATE INDEX "projects_status_idx" ON platform.projects USING btree (status);

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

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projects" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projects" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."projects" IS 'Server-only. A long-lived DevDogs project that members can report independent work on for EL credit (Q119, Q123, Q170). A member proposes one (status proposed); leadership approves it in the console (active) and assigns an advisor, or declines it. "repos" are "owner/name" strings and carry no access: repository permissions are set in GitHub. There is no recruitment flow; the advisor keeps the member list in platform."projectMembers". Account deletion: a project outlives the people on it. A deleted advisor leaves "advisorId" null (ON DELETE SET NULL) so the project is waiting for a new one, not gone; "proposedBy" and "approvedBy" are likewise set null.';

COMMENT ON COLUMN "platform"."projects"."status" IS 'proposed (awaiting leadership), active, declined, archived. Only an active project takes members and reports.';

COMMENT ON COLUMN "platform"."projects"."advisorId" IS 'The member who keeps the project''s member list and reviews its reports. Null until leadership assigns one, and again after the advisor''s account is deleted.';
