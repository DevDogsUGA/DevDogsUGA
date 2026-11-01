CREATE TABLE "platform"."projects" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "description" text,
  "repos"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"      text                     NOT NULL DEFAULT 'active',
  "advisorId"   uuid,
  "proposedBy"  uuid,
  "approvedBy"  uuid,
  "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "decidedAt"   timestamp with time zone,
  "updatedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "slug" text NOT NULL CONSTRAINT "projects_slug_length" CHECK (char_length("slug") <= 80 AND char_length(btrim("slug")) >= 2),
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "featured" boolean NOT NULL DEFAULT false,
  "inSwitcher" boolean NOT NULL DEFAULT false,
  "devdogsOwned" boolean NOT NULL DEFAULT false,
  "tagline" text CONSTRAINT "projects_tagline_length" CHECK (char_length("tagline") <= 160),
  "yearLabel" text CONSTRAINT "projects_yearLabel_length" CHECK (char_length("yearLabel") <= 40),
  "note" text CONSTRAINT "projects_note_length" CHECK (char_length("note") <= 280),
  "liveLabel" text CONSTRAINT "projects_liveLabel_length" CHECK (char_length("liveLabel") <= 80),
  "switcherBlurb" text CONSTRAINT "projects_switcherBlurb_length" CHECK (char_length("switcherBlurb") <= 80),
  "iconKey" text CONSTRAINT "projects_iconKey_length" CHECK (char_length("iconKey") <= 64),
  "colorKey" text CONSTRAINT "projects_colorKey_length" CHECK (char_length("colorKey") <= 64),
  "showcaseLabel" text CONSTRAINT "projects_showcaseLabel_length" CHECK (char_length("showcaseLabel") <= 80),
  "liveUrl" text CONSTRAINT "projects_liveUrl_shape" CHECK (char_length("liveUrl") <= 2048 AND ("liveUrl" ~ '^https://[^/[:space:]]+' OR "liveUrl" ~ '^/([^/]|$)')),
  "switcherUrl" text CONSTRAINT "projects_switcherUrl_shape" CHECK (char_length("switcherUrl") <= 2048 AND ("switcherUrl" ~ '^https://[^/[:space:]]+' OR "switcherUrl" ~ '^/([^/]|$)')),
  "contributionMode" text CONSTRAINT "projects_contributionMode_choices" CHECK ("contributionMode" IN ('open','closed')),
  "displayOrder" integer NOT NULL DEFAULT 0,
  "docsRepoId" bigint REFERENCES platform."githubRepos"("githubRepoId") ON UPDATE CASCADE ON DELETE RESTRICT,
  "docsRequested" boolean NOT NULL DEFAULT false,
  "docsFirstPublishedAt" timestamp with time zone,
  "docsPausedAt" timestamp with time zone,
  "docsPauseReason" text CONSTRAINT "projects_docsPauseReason_length" CHECK (char_length("docsPauseReason") <= 280),
  "docsConfirmedOwnerId" bigint CONSTRAINT "projects_docsConfirmedOwnerId_positive" CHECK ("docsConfirmedOwnerId" > 0),
  "docsConfirmedBy" uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "docsConfirmedAt" timestamp with time zone,
  "lastDocsDispatchedSha" text CONSTRAINT "projects_lastDocsDispatchedSha_format" CHECK ("lastDocsDispatchedSha" ~ '^[0-9a-f]{40}$'),
  CONSTRAINT "projects_docs_pause_shape" CHECK (("docsPausedAt" IS NULL) = ("docsPauseReason" IS NULL)),
  CONSTRAINT "projects_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projects_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projects_description_length" CHECK (((description IS NULL) OR (char_length(description) <= 1000))),
  CONSTRAINT "projects_name_length" CHECK ((char_length(btrim(name)) BETWEEN 2 AND 80)),
  CONSTRAINT "projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "projects_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projects_repos_count" CHECK ((cardinality(repos) <= 10)),
  CONSTRAINT "projects_slug_key" UNIQUE ("slug"),
  CONSTRAINT "projects_status_choices" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
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

COMMENT ON TABLE "platform"."projects" IS 'Server-only. A long-lived DevDogs project that members can report independent work on for EL credit (Q119, Q123, Q170). Any member creates one from repositories they control (active) or, while every repository waits on an officer, archived. Owners edit it (projectOwners; Officers on a DevDogs-owned one, as a record rule, never as rows); Contributors are derived from stored commits. "advisorId" is the member who reviews its reports. The legacy "repos" strings and proposal columns are read by nothing and drop in the contract change. Account deletion: a project outlives the people on it. A deleted advisor leaves "advisorId" null (ON DELETE SET NULL) so the project is waiting for a new one, not gone; "proposedBy" and "approvedBy" are likewise set null.';

COMMENT ON COLUMN "platform"."projects"."status" IS 'active or archived. Only an active project takes reports. An active project always has at least one approved repository link (a deferred constraint trigger, checked at commit); archive it, never delete one with reports or submissions.';

COMMENT ON COLUMN "platform"."projects"."slug" IS 'The project''s URL segment and docs mount: lowercase hyphenated, 2 to 80 characters, unique. Frozen once docs have published; the reserved docs namespaces are refused (guard_project_structure).';

COMMENT ON COLUMN "platform"."projects"."advisorId" IS 'The member who keeps the project''s member list and reviews its reports. Null until leadership assigns one, and again after the advisor''s account is deleted.';

CREATE INDEX "projects_featured_displayOrder_id_idx" ON platform.projects ("displayOrder", id) WHERE featured;
CREATE INDEX "projects_inSwitcher_displayOrder_id_idx" ON platform.projects ("displayOrder", id) WHERE "inSwitcher";

CREATE TRIGGER projects_guard_structure
  BEFORE INSERT OR UPDATE OR DELETE ON platform."projects"
  FOR EACH ROW EXECUTE FUNCTION platform.guard_project_structure();

CREATE TRIGGER projects_validate_showcase
  BEFORE INSERT OR UPDATE OF tags, "iconKey", "colorKey" ON platform."projects"
  FOR EACH ROW EXECUTE FUNCTION platform.validate_project_showcase();

CREATE CONSTRAINT TRIGGER projects_require_approved_repo
  AFTER INSERT OR UPDATE OF status ON platform."projects"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform.require_approved_repo();
