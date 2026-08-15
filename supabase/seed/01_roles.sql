-- Built-in role definitions, so `pnpm devtools grant-root` works on a freshly
-- reset instance without a second command.
--
-- `apps/platform/scripts/seed-builtin-roles.ts` remains authoritative -- it is
-- what production runs, and it additionally bootstraps Root onto the earliest
-- non-test user. This is the local/test bootstrap for the case that script
-- cannot help with: an instance where no profile exists yet, so there is nobody
-- to bootstrap onto.
--
-- Deliberately does NOT restate the permission matrix, so there is nothing here
-- to drift out of step with ALL_TRUE/ALL_FALSE in that script:
--
--   * Root's permission columns are irrelevant. "resolvedUserPermissions"
--     special-cases root holders (`CASE WHEN rh."userId" IS NOT NULL THEN true`)
--     for every permission, so a Root row with all-null columns still resolves
--     to full access.
--   * Member is the default role and grants nothing, so all-null is already the
--     correct answer for it.
--
-- `rank` must be null for both: the "roles_custom_requires_rank" check ties a
-- non-null rank to roleType = 'custom'.

insert into "platform"."roles" ("id", "title", "description", "roleType", "rank")
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Member',
    'Default role for every member. No special permissions.',
    'default',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Root',
    'Full access to every permission. Singleton — transferable, never directly assigned or removed.',
    'root',
    null
  )
on conflict ("id") do nothing;
