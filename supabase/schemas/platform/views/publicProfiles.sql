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
    p."showCompetitions",
    p."showContributions",
    p."showStars"
   FROM (platform.profile p
     JOIN platform."profileWithVerification" v ON ((v."userId" = p."userId")))
  WHERE (v.verified AND p."publicProfile" AND (p.handle IS NOT NULL) AND (p."quarantinedBy" IS NULL) AND (NOT platform.is_suspended(p."userId")) AND (NOT (EXISTS ( SELECT 1
           FROM platform."accountDeletions" d
          WHERE (d."userId" = p."userId")))));

REVOKE ALL ON TABLE "platform"."publicProfiles" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."publicProfiles" TO "postgres", "service_role";

COMMENT ON VIEW "platform"."publicProfiles" IS 'The one definition of a public member profile. Server-only (no anon/authenticated grant). Hidden fields are NULL. Never add legal/involvement names, emails or attendance.';
