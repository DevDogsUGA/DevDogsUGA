-- Personas, and a worked example of a report against real content.
--
-- Without these a fresh instance has nothing to moderate: no member exists, so
-- there is nothing to report, and the console's moderation queue opens empty and
-- unexplained. Seeds only ever run on `supabase db reset`, which is pointed at a
-- local stack or a contributor's own throwaway project, never production.
--
-- ⚠️ THE CONTENT HERE IS REAL. An earlier version of this file seeded a
-- `sandbox` schema of fake posts and comments -- an entire fixture app,
-- registered in platform."apps" on every tier including production, denied there
-- by a restrictive policy. It is gone. What is reported below is
-- platform."profile", the same table the account settings page writes, so the
-- integration a contributor reads here is the one that actually ships.

-- ============================================================
-- Personas
-- ============================================================
--
-- Seeded rather than federated. A contributor can sign in as one of these with
-- email/password on any tier, including the local Docker stack, which is HTTP
-- and therefore cannot host OAuth at all.
--
-- Every one of them signs in with the password `password`. That is fine here
-- and nowhere else: seeds do not run on `db push`, so this file cannot reach a
-- database that was not deliberately erased first.
--
-- They exist mainly so a contributor can *encounter* a permission boundary.
-- You are always Root on your own instance, so clicking around never denies you
-- anything -- switching to `member@devdogs.test` is the only way to see what an
-- ordinary user sees.

-- The empty strings are not decoration. GoTrue scans confirmation_token,
-- recovery_token, email_change_token_new and email_change into non-nullable Go
-- strings, and those four columns have no database default, so a row inserted
-- without them exists but fails every sign-in with "Database error querying
-- schema" -- an error that names neither the column nor the user.
insert into auth.users (
  "id", "instance_id", "aud", "role", "email", "encrypted_password",
  "email_confirmed_at", "raw_app_meta_data", "raw_user_meta_data",
  "confirmation_token", "recovery_token", "email_change_token_new", "email_change",
  "created_at", "updated_at"
)
values
  (
    '00000000-0000-4000-a000-000000000001',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'member@devdogs.test', extensions.crypt('password', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"preferred_name":"Sandy Member"}'::jsonb,
    '', '', '', '', now(), now()
  ),
  (
    '00000000-0000-4000-a000-000000000002',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'author@devdogs.test', extensions.crypt('password', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"preferred_name":"Avery Author"}'::jsonb,
    '', '', '', '', now(), now()
  ),
  (
    '00000000-0000-4000-a000-000000000003',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'moderator@devdogs.test', extensions.crypt('password', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"preferred_name":"Morgan Moderator"}'::jsonb,
    '', '', '', '', now(), now()
  )
on conflict ("id") do nothing;

-- GoTrue resolves an email/password sign-in through auth.identities, not
-- auth.users, so a user without one of these exists but cannot log in.
insert into auth.identities (
  "id", "user_id", "provider_id", "provider", "identity_data",
  "last_sign_in_at", "created_at", "updated_at"
)
select
  gen_random_uuid(), u."id", u."id"::text, 'email',
  jsonb_build_object('sub', u."id"::text, 'email', u."email", 'email_verified', true),
  now(), now(), now()
from auth.users u
where u."email" like '%@devdogs.test'
on conflict ("provider", "provider_id") do nothing;

-- The profiles are the reportable content, so what goes in them matters.
--
-- Avery carries a legal name and Sandy does not, which is the difference the
-- quarantine trigger turns on: resolving a report against Avery's profile
-- resets the display name to the name of record, and resolving one against
-- Sandy's leaves it alone and warns. Both paths are worth being able to see.
insert into "platform"."profile"
  ("userId", "preferredName", "bio", "legalFirstName", "legalLastName")
values
  (
    '00000000-0000-4000-a000-000000000001',
    'Sandy Member', 'A perfectly ordinary member.',
    null, null
  ),
  (
    '00000000-0000-4000-a000-000000000002',
    'BUY CHEAP FOLLOWERS NOW',
    'Buy now! Resolve the open report from /console/moderation.',
    'Avery', 'Author'
  ),
  (
    '00000000-0000-4000-a000-000000000003',
    'Morgan Moderator', 'Reviews the queue.',
    'Morgan', 'Moderator'
  )
on conflict ("userId") do nothing;

-- A custom role, deliberately not Root.
--
-- Root stays unheld so a contributor can grant it to themselves on a fresh
-- instance -- `pnpm devtools grant-root`, which writes the row with the service
-- key. Seeding a Root holder would take that away. This role exists so there is
-- a persona who can work the queue *without* being able to do everything, which
-- is the only way to see a permission boundary on an instance where you are
-- otherwise Root.
insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "canModerate"
)
values (
  '00000000-0000-4000-9000-000000000001',
  'Moderator',
  'Seeded persona role: works the report queue, and nothing else.',
  'custom', 500, true
)
on conflict ("id") do nothing;

insert into "platform"."userRoles" ("userId", "roleId")
values (
  '00000000-0000-4000-a000-000000000003',
  '00000000-0000-4000-9000-000000000001'
)
on conflict do nothing;

-- ============================================================
-- Report reasons -- deliberately absent
-- ============================================================
--
-- Reasons used to be seeded here, cross-joined onto every registered app: the
-- same eight rows copied once per app, which is what made it obvious they were
-- never per-app at all.
--
-- They are now a global vocabulary, created by
-- 20260807000000_platform_report_reasons_enum.sql. That matters beyond tidiness:
-- seeds run only on `db reset`, never on production, so seeding them meant a
-- fresh production instance had no reasons and could accept no reports until
-- somebody typed them into a dashboard page. Being in a migration is what makes
-- every tier agree.

-- ============================================================
-- One open report
-- ============================================================
--
-- Inserted directly rather than through platform.file_report(), which needs a
-- session. The RPC is the only supported way for an application to file one --
-- it is what fills "reportedUserId" and "contentSnapshot" from the content
-- itself so a client cannot falsify either. This row spells that out longhand
-- because a seed has no caller to attribute it to.
--
-- Left OPEN rather than pre-resolved, and that is the whole design of this
-- fixture. The interesting half of profile moderation is what resolving does --
-- the freeze, and the name reset -- and a seed that had already resolved it
-- would show a contributor the after state with no way to watch the transition.
-- Resolve it from /console/moderation as `moderator@devdogs.test`.
--
-- "contentRef" is the profile's primary key, which is the member's own
-- auth.users id. That is not a coincidence to be tidied away later: profile is
-- one row per user, so addressing the content and addressing the author are the
-- same question.
insert into "platform"."reports" (
  "id", "appId", "reporterUserId", "reportedUserId",
  "contentType", "contentRef", "contentSnapshot", "description", "reason", "status"
)
select
  '00000000-0000-4000-e000-000000000001',
  a."id",
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  'profile',
  '00000000-0000-4000-a000-000000000002',
  'BUY CHEAP FOLLOWERS NOW' || E'\n\n' ||
    'Buy now! Resolve the open report from /console/moderation.',
  'This is the second one today.',
  'spam',
  'open'
from "platform"."apps" a
where a."slug" = 'platform'
on conflict ("id") do nothing;
