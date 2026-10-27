-- The logos of the two DevDogs apps (oauth-consent Q159). The images are the
-- sdk's DogDays and DogPack AppIcons, uploaded to the public avatars bucket by
-- `backstage deploy avatars` (supabase/seed/app-icons/apps/<name>.webp), which
-- runs after the seeds; the consent screen reads the path relative to that
-- bucket. Insert-only like every seed: a logo that is already set (a holder
-- chose another) is never replaced, and an app that does not exist yet is
-- skipped, so the statement is safe to run again.
update platform."oauthRegistrations"
   set "logoPath" = 'apps/dogdays.webp'
 where "userId" is null
   and "logoPath" is null
   and label ilike '%dogdays%';

update platform."oauthRegistrations"
   set "logoPath" = 'apps/dogpack.webp'
 where "userId" is null
   and "logoPath" is null
   and label ilike '%dogpack%';
