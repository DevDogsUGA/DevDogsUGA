CREATE OR REPLACE VIEW platform."projectRepoDetails" WITH (security_invoker=on) AS
SELECT pr.*, gr.owner, gr.name, gr."ownerId", gr."defaultBranch", gr.health,
       gr."lastCheckedAt", gr."lastAvailableAt", gr."unavailableSince"
FROM platform."projectRepos" pr JOIN platform."githubRepos" gr USING ("githubRepoId");

REVOKE ALL ON TABLE platform."projectRepoDetails" FROM "anon", "authenticated";
GRANT SELECT ON TABLE platform."projectRepoDetails" TO "postgres", "service_role";
