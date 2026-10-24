CREATE TABLE "platform"."projectMembers" (
  "projectId" uuid                     NOT NULL,
  "userId"    uuid                     NOT NULL,
  "addedBy"   uuid,
  "addedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projectMembers_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "projectMembers_pkey" PRIMARY KEY ("projectId", "userId"),
  CONSTRAINT "projectMembers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES platform.projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "projectMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."projectMembers"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "projectMembers_userId_idx" ON platform."projectMembers" USING btree ("userId");

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

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."projectMembers" TO "postgres", "service_role";

REVOKE ALL ON TABLE "platform"."projectMembers" FROM "anon", "authenticated";

COMMENT ON TABLE "platform"."projectMembers" IS 'Server-only. Who works on a project; kept by the project''s advisor (or leadership). Account deletion: the member''s rows are deleted with the account (ON DELETE CASCADE); "addedBy" is set null when the adder''s account goes.';
