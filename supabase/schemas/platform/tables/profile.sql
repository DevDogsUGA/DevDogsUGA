CREATE TABLE "platform"."profile" (
  "userId"                uuid                        NOT NULL,
  "preferredName"         character varying(255)      NOT NULL,
  "bio"                   character varying(127),
  "pronouns"              text[],
  "graduationYear"        integer,
  "showGithub"            boolean                     NOT NULL DEFAULT false,
  "showDiscord"           boolean                     NOT NULL DEFAULT false,
  "showEmail"             boolean                     NOT NULL DEFAULT false,
  "showLinkedin"          boolean                     NOT NULL DEFAULT false,
  "viewedConsole"         boolean                     NOT NULL DEFAULT false,
  "involvementFirstName"  text,
  "involvementLastName"   text,
  "involvementImportedAt" timestamp without time zone,
  "roleDescription"       character varying(512),
  "ugaEmail"              text,
  "legalFirstName"        text,
  "legalLastName"         text,
  "identitySourcedAt"     timestamp with time zone,
  "quarantinedBy"         uuid,
  "publicProfile"         boolean                     NOT NULL DEFAULT true,
  "showName"              boolean                     NOT NULL DEFAULT true,
  "showAvatar"            boolean                     NOT NULL DEFAULT true,
  "showBio"               boolean                     NOT NULL DEFAULT true,
  "showLinks"             boolean                     NOT NULL DEFAULT true,
  "showStars"             boolean                     NOT NULL DEFAULT true,
  "handle"                text,
  CONSTRAINT "profile_handle_format"
    CHECK (((handle IS NULL) OR ((handle ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'::text) AND ((char_length(handle) >= 2) AND (char_length(handle) <= 39))))),
  CONSTRAINT "profile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "profile_ugaEmail_lowercase" CHECK ((("ugaEmail" IS NULL) OR ("ugaEmail" = lower("ugaEmail")))),
  CONSTRAINT "profile_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "profile_quarantinedBy_fkey" FOREIGN KEY ("quarantinedBy") REFERENCES platform."reportResolutions"(id) ON DELETE SET NULL
);

ALTER TABLE "platform"."profile"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."profile"
  ADD COLUMN "graduationSemester" platform."graduationSemester";

CREATE UNIQUE INDEX profile_handle_key ON platform.profile USING btree (handle);

CREATE INDEX profile_handle_prefix_idx ON platform.profile USING btree (handle text_pattern_ops)
  WHERE (handle IS NOT NULL);

CREATE UNIQUE INDEX "profile_ugaEmail_key" ON platform.profile USING btree ("ugaEmail");

CREATE TRIGGER profile_reset_name_on_quarantine
  BEFORE UPDATE ON platform.profile
  FOR EACH ROW
  WHEN (((old."quarantinedBy" IS NULL) AND (new."quarantinedBy" IS NOT NULL)))
  EXECUTE FUNCTION platform.reset_name_on_quarantine();

CREATE POLICY "crud_authenticated_policy_delete" ON "platform"."profile"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (false);

CREATE POLICY "crud_authenticated_policy_insert" ON "platform"."profile"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (false);

CREATE POLICY "crud_authenticated_policy_select" ON "platform"."profile"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = "userId"));

CREATE POLICY "crud_authenticated_policy_update" ON "platform"."profile"
  FOR UPDATE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "userId") AND ("quarantinedBy" IS NULL) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid)))))
  WITH CHECK (((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."profile" TO "postgres", "service_role";

COMMENT ON COLUMN "platform"."profile"."handle" IS 'The member''s public URL name (/community/@handle). Null until chosen. Lowercase, unique, and written only by platform.set_handle(), which accepts nothing outside platform.handle_options().';

COMMENT ON COLUMN "platform"."profile"."identitySourcedAt" IS 'When a roster import last confirmed the durable identity columns. Unlike "involvementImportedAt" this is not reset when a member is absent from an import.';

COMMENT ON COLUMN "platform"."profile"."legalFirstName" IS 'Name of record from the Involvement roster. Never cleared by an import -- see "involvementFirstName" for current-roster status.';

COMMENT ON COLUMN "platform"."profile"."legalLastName" IS 'Name of record from the Involvement roster. Never cleared by an import -- see "involvementLastName" for current-roster status.';

COMMENT ON COLUMN "platform"."profile"."publicProfile" IS 'Master switch. False removes the member from every public surface regardless of the per-field switches.';

COMMENT ON COLUMN "platform"."profile"."roleDescription" IS 'The officer bio shown on the homepage Leadership section. Editable by the holder from /account, but only surfaced there for members whose roles include one with "isLeadership". Distinct from "bio", which is the 127-character blurb on the member''s own profile.';

COMMENT ON COLUMN "platform"."profile"."ugaEmail" IS 'Institutional address from the Involvement roster. Durable identity: never cleared by an import. Distinct from auth.users.email, which is whatever the member signed up with.';

COMMENT ON INDEX "platform"."profile_ugaEmail_key" IS 'Unique, and written only by the Involvement roster import.';

REVOKE ALL ON TABLE "platform"."profile" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "platform"."profile" TO "anon";

REVOKE ALL ON TABLE "platform"."profile" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("bio") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("bio") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("graduationSemester") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("graduationSemester") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("graduationYear") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("graduationYear") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("preferredName") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("preferredName") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("pronouns") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("pronouns") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("publicProfile") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("publicProfile") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("roleDescription") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("roleDescription") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showAvatar") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showAvatar") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showBio") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showBio") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showDiscord") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showDiscord") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showEmail") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showEmail") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showGithub") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showGithub") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showLinkedin") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showLinkedin") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showLinks") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showLinks") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showName") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showName") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("showStars") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("showStars") ON TABLE "platform"."profile" TO "authenticated";

REVOKE ALL ("viewedConsole") ON TABLE "platform"."profile" FROM "authenticated";

GRANT UPDATE ("viewedConsole") ON TABLE "platform"."profile" TO "authenticated";
