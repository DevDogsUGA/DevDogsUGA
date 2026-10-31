-- Verified repository anchor: D0 §8.2. Officers are never materialized as Owners.
INSERT INTO platform."githubRepos"
  ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch", "isDevdogsOrg")
VALUES (792882166, 168223232, 'DevDogsUGA', 'DevDogsUGA', 'Organization', 'main', true)
ON CONFLICT DO NOTHING;

INSERT INTO platform.projects
  (id, slug, name, status, description, "devdogsOwned", featured, "inSwitcher",
   tagline, "yearLabel", "iconKey", "colorKey", "showcaseLabel", "contributionMode",
   "switcherUrl", "switcherBlurb", tags)
SELECT 'd1000000-0000-4000-a000-000000000001', 'platform', 'DevDogs Platform', 'active',
  'The site you''re on. A member portal and developer platform for the club: community profiles, documentation, and all the tooling that runs DevDogs.',
  true, true, true, 'Member Portal and Dev Tools', '2026 – present', 'HouseIcon', 'cyan-400',
  'Maintenance', 'closed', '/', 'Member Portal',
  ARRAY['next','typescript','tailwind','drizzle','supabase','postgres']
WHERE NOT EXISTS (SELECT 1 FROM platform.projects WHERE lower(btrim(name)) = 'devdogs platform')
ON CONFLICT DO NOTHING;

INSERT INTO platform."projectRepos"
  ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
SELECT id, 792882166, 'approved', 'devdogs-write', 168223232, now()
FROM platform.projects WHERE lower(btrim(name)) = 'devdogs platform'
ON CONFLICT DO NOTHING;

INSERT INTO platform."projectSyncJobs" (job) VALUES ('commit-sync'), ('devpost-sync')
ON CONFLICT DO NOTHING;
