-- D6: the homepage, the footer and the app switcher read the project showcase
-- from platform.projects instead of apps/platform/src/config/projects.ts, which
-- is deleted. This puts that file's projects where it had them, so the three
-- surfaces look the same.
--
-- Platform: 78 already initialises its showcase fields on the pre-expand
-- "DevDogs Platform" row, and supabase/seed/projects/platform.sql inserts the
-- row where none exists. The first statement covers the remaining case, a row
-- that already carries the slug but not every field. It only fills what is
-- empty, so it never overwrites an officer's edit. The toggles (featured,
-- inSwitcher) are left alone: an officer who has turned one off meant it. On a
-- fresh database there is no platform row yet when this runs, so it changes
-- nothing there.
--
-- DogDays and DogPack: the two entries in config/projects.ts that have a public
-- repository to anchor a row on (D0 section 8). Each gets its repository, a
-- DevDogs-owned active project that is featured and in the switcher, and an
-- approved link, the way the seed anchors the platform. No owner rows: officers
-- edit a DevDogs-owned project by record rule. An existing project with the
-- same name (case-insensitive) is reused, as 78 did for the platform, and every
-- insert is "on conflict do nothing", so a rerun changes nothing. Wuphf and
-- Better Bus Tracker have no repository and are not created; each becomes a
-- project when its owner creates it.

UPDATE platform.projects
SET description = COALESCE(
      description,
      'The site you''re on. A member portal and developer platform for the club: community profiles, documentation, and all the tooling that runs DevDogs.'
    ),
    tagline = COALESCE(tagline, 'Member Portal and Dev Tools'),
    "yearLabel" = COALESCE("yearLabel", '2026 – present'),
    "iconKey" = COALESCE("iconKey", 'HouseIcon'),
    "colorKey" = COALESCE("colorKey", 'cyan-400'),
    "showcaseLabel" = COALESCE("showcaseLabel", 'Maintenance'),
    "contributionMode" = COALESCE("contributionMode", 'closed'),
    "switcherUrl" = COALESCE("switcherUrl", '/'),
    "switcherBlurb" = COALESCE("switcherBlurb", 'Member Portal'),
    tags = CASE
      WHEN cardinality(tags) = 0
        THEN ARRAY['next','typescript','tailwind','drizzle','supabase','postgres']
      ELSE tags
    END
WHERE slug = 'platform';

INSERT INTO platform."githubRepos"
  ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch", "isDevdogsOrg")
VALUES
  (835908737, 168223232, 'DevDogsUGA', 'DogDays', 'Organization', 'main', true),
  (1415368988, 168223232, 'DevDogsUGA', 'DogPack', 'Organization', 'main', true)
ON CONFLICT DO NOTHING;

-- Reuse a project someone already created under the name, if it has no slug.
UPDATE platform.projects
SET slug = 'dogdays', "devdogsOwned" = true, featured = true, "inSwitcher" = true,
    tagline = 'Schedule Builder', "yearLabel" = '2024 – present',
    "iconKey" = 'DogDaysIcon', "colorKey" = 'red-600', "showcaseLabel" = 'Public alpha',
    "contributionMode" = 'open', "liveUrl" = 'https://dogdays.dev', "liveLabel" = 'Public Alpha',
    "switcherUrl" = 'https://dogdays.dev', "switcherBlurb" = 'Schedule Builder',
    "displayOrder" = 1, tags = ARRAY['Next.js','TypeScript','Tailwind CSS','Supabase']
WHERE lower(btrim(name)) = 'dogdays' AND slug IS NULL
  AND NOT EXISTS (SELECT 1 FROM platform.projects WHERE slug = 'dogdays');

UPDATE platform.projects
SET slug = 'dogpack', "devdogsOwned" = true, featured = true, "inSwitcher" = true,
    tagline = 'Study Group Finder', "yearLabel" = '2026 – present',
    "iconKey" = 'DogPackIcon', "colorKey" = 'purple-500', "showcaseLabel" = 'Pilot',
    "contributionMode" = 'open', "switcherBlurb" = 'Study Group Finder',
    "displayOrder" = 2, tags = ARRAY['Flutter','Dart','Supabase']
WHERE lower(btrim(name)) = 'dogpack' AND slug IS NULL
  AND NOT EXISTS (SELECT 1 FROM platform.projects WHERE slug = 'dogpack');

INSERT INTO platform.projects
  (id, slug, name, status, description, "devdogsOwned", featured, "inSwitcher",
   tagline, "yearLabel", "iconKey", "colorKey", "showcaseLabel", "contributionMode",
   "liveUrl", "liveLabel", "switcherUrl", "switcherBlurb", "displayOrder", tags)
SELECT 'd1000000-0000-4000-a000-000000000002', 'dogdays', 'DogDays', 'active',
  'Plan your semester against live UGA registrar data. Answer a short questionnaire, and DogDays generates conflict-free schedules, considering walking distance between buildings and the credits you already have.',
  true, true, true, 'Schedule Builder', '2024 – present', 'DogDaysIcon', 'red-600',
  'Public alpha', 'open', 'https://dogdays.dev', 'Public Alpha', 'https://dogdays.dev',
  'Schedule Builder', 1, ARRAY['Next.js','TypeScript','Tailwind CSS','Supabase']
WHERE NOT EXISTS (SELECT 1 FROM platform.projects WHERE lower(btrim(name)) = 'dogdays')
ON CONFLICT DO NOTHING;

INSERT INTO platform.projects
  (id, slug, name, status, description, "devdogsOwned", featured, "inSwitcher",
   tagline, "yearLabel", "iconKey", "colorKey", "showcaseLabel", "contributionMode",
   "switcherBlurb", "displayOrder", tags)
SELECT 'd1000000-0000-4000-a000-000000000003', 'dogpack', 'DogPack', 'active',
  'Our first mobile app: find the people already studying what you''re studying. Match with classmates by course, form a group, and pick a time and place that works for everyone!',
  true, true, true, 'Study Group Finder', '2026 – present', 'DogPackIcon', 'purple-500',
  'Pilot', 'open', 'Study Group Finder', 2, ARRAY['Flutter','Dart','Supabase']
WHERE NOT EXISTS (SELECT 1 FROM platform.projects WHERE lower(btrim(name)) = 'dogpack')
ON CONFLICT DO NOTHING;

INSERT INTO platform."projectRepos"
  ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
SELECT id, 835908737, 'approved', 'devdogs-write', 168223232, now()
FROM platform.projects WHERE slug = 'dogdays'
ON CONFLICT DO NOTHING;

INSERT INTO platform."projectRepos"
  ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
SELECT id, 1415368988, 'approved', 'devdogs-write', 168223232, now()
FROM platform.projects WHERE slug = 'dogpack'
ON CONFLICT DO NOTHING;
