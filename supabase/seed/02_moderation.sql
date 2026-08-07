-- Fixtures for the moderation and feedback tooling.
--
-- Without these a fresh instance opens every tools page empty: no apps have
-- report reasons, so nothing can be reported; no content exists, so there is
-- nothing to report it against; and the persona suite has no fixture to file
-- against either. Seeds only ever run on `supabase db reset`, which is pointed
-- at a local stack or a contributor's own throwaway project, never production.
--
-- The sandbox rows here are also the worked example of the integration an app
-- has to perform. If you are wiring up a new app, read
-- 20260730000003_sandbox_fixture_app.sql and then this file.

-- ============================================================
-- Personas
-- ============================================================
--
-- Seeded rather than federated. A contributor can sign in as one of these with
-- email/password on any tier, including the local Docker stack, which is HTTP
-- and therefore cannot host OAuth at all.
--
-- Every one of them signs in with the password `password`. That is fine here
-- and nowhere else: this file cannot reach production, and the instance gate
-- refuses to be demoted by anything short of a migration.
--
-- They exist mainly so a contributor can *encounter* a permission boundary.
-- You are always Root on your own instance, so clicking around never denies you
-- anything -- switching to `member@sandbox.test` is the only way to see what an
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
    'member@sandbox.test', extensions.crypt('password', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"preferred_name":"Sandy Member"}'::jsonb,
    '', '', '', '', now(), now()
  ),
  (
    '00000000-0000-4000-a000-000000000002',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'author@sandbox.test', extensions.crypt('password', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"preferred_name":"Avery Author"}'::jsonb,
    '', '', '', '', now(), now()
  ),
  (
    '00000000-0000-4000-a000-000000000003',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'moderator@sandbox.test', extensions.crypt('password', extensions.gen_salt('bf')),
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
where u."email" like '%@sandbox.test'
on conflict ("provider", "provider_id") do nothing;

insert into "platform"."profile" ("userId", "preferredName", "bio")
values
  ('00000000-0000-4000-a000-000000000001', 'Sandy Member',    'A perfectly ordinary member.'),
  ('00000000-0000-4000-a000-000000000002', 'Avery Author',    'Writes things in the sandbox.'),
  ('00000000-0000-4000-a000-000000000003', 'Morgan Moderator','Reviews the queue.')
on conflict ("userId") do nothing;

-- A custom role, deliberately not Root.
--
-- Root stays unheld so `platform.claim_root()` still works for the contributor
-- -- that is how you grant yourself the console on a fresh instance, and seeding
-- a Root holder would take it away. This exists so there is a persona who can
-- work the queue *without* being able to do everything, which is the only way
-- to see a permission boundary on an instance where you are otherwise Root.
insert into "platform"."roles" (
  "id", "title", "description", "roleType", "rank",
  "canModerate", "canManageFeedback"
)
values (
  '00000000-0000-4000-9000-000000000001',
  'Sandbox Moderator',
  'Seeded persona role: works the report queue and reads feedback, nothing else.',
  'custom', 500, true, true
)
on conflict ("id") do nothing;

insert into "platform"."userRoles" ("userId", "roleId")
values (
  '00000000-0000-4000-a000-000000000003',
  '00000000-0000-4000-9000-000000000001'
)
on conflict do nothing;

-- ============================================================
-- Report reasons
-- ============================================================
--
-- Per app, because the reason list is part of an app's own moderation policy.
-- Every registered app gets the same starting set; the tools page is where a
-- maintainer diverges from it.

insert into "platform"."reportReasons" ("appId", "title", "description")
select a."id", r."title", r."description"
from "platform"."apps" a
cross join (values
  ('Harassment',        'Targeted abuse, bullying, or unwanted contact.'),
  ('Hate speech',       'Attacks a person or group on the basis of who they are.'),
  ('Spam',              'Unsolicited advertising, scams, or repetitive posting.'),
  ('Sexual content',    'Sexually explicit material.'),
  ('Violence',          'Threats of violence, or content glorifying it.'),
  ('Impersonation',     'Pretending to be another person or organisation.'),
  ('Off-topic',         'Not relevant to this space.'),
  ('Something else',    'Anything not covered above — please describe it.')
) as r("title", "description")
on conflict do nothing;

-- ============================================================
-- Feedback topics
-- ============================================================

insert into "platform"."feedbackTopics" ("appId", "label")
select a."id", t."label"
from "platform"."apps" a
cross join (values
  ('Homepage'), ('Events'), ('Projects'), ('Community'),
  ('Console'), ('OAuth'), ('Docs'), ('Navigation'), ('Other')
) as t("label")
where a."slug" = 'platform'
on conflict do nothing;

insert into "platform"."feedbackTopics" ("appId", "label")
select a."id", t."label"
from "platform"."apps" a
cross join (values
  ('Posts'), ('Comments'), ('Profiles'), ('Other')
) as t("label")
where a."slug" = 'sandbox'
on conflict do nothing;

-- ============================================================
-- Sandbox content
-- ============================================================

insert into sandbox."profiles" ("id", "userId", "handle", "bio")
values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'sandy',  'Here to read.'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002', 'avery',  'Posts a lot. Some of it fine.'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003', 'morgan', 'Moderator.')
on conflict ("id") do nothing;

insert into sandbox."posts" ("id", "authorUserId", "title", "body")
values
  (
    '00000000-0000-4000-c000-000000000001',
    '00000000-0000-4000-a000-000000000002',
    'How do I get started with DevDogs?',
    'An ordinary post. Nothing has been reported about it, so it is what the queue looks like when it is empty.'
  ),
  (
    '00000000-0000-4000-c000-000000000002',
    '00000000-0000-4000-a000-000000000002',
    'BUY CHEAP FOLLOWERS NOW',
    'Clearly spam, and the subject of the open report below. Resolve it from /console/moderation to watch it disappear from the listing.'
  ),
  (
    '00000000-0000-4000-c000-000000000003',
    '00000000-0000-4000-a000-000000000002',
    'This one is already quarantined',
    'The resolved report below hid this. It is still visible to its author and to a moderator, and invisible to everyone else -- which is the sandbox read policy doing the work, not the platform.'
  )
on conflict ("id") do nothing;

insert into sandbox."comments" ("id", "postId", "authorUserId", "body")
values
  (
    '00000000-0000-4000-d000-000000000001',
    '00000000-0000-4000-c000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    'Welcome! Start with the docs.'
  )
on conflict ("id") do nothing;

-- ============================================================
-- Sample reports
-- ============================================================
--
-- Inserted directly rather than through platform.file_report(), which needs a
-- session. The RPC is the only supported way for an application to file one --
-- it is what fills "reportedUserId" and "contentSnapshot" from the content
-- itself so a client cannot falsify either. These rows spell that out longhand
-- because a seed has no caller to attribute them to.

insert into "platform"."reports" (
  "id", "appId", "reporterUserId", "reportedUserId",
  "contentType", "contentRef", "contentSnapshot", "description", "reasonId", "status"
)
select
  '00000000-0000-4000-e000-000000000001',
  a."id",
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  'posts',
  '00000000-0000-4000-c000-000000000002',
  'BUY CHEAP FOLLOWERS NOW' || E'\n\n' ||
    'Clearly spam, and the subject of the open report below. Resolve it from /console/moderation to watch it disappear from the listing.',
  'This is the second one today.',
  rr."id",
  'open'
from "platform"."apps" a
join "platform"."reportReasons" rr on rr."appId" = a."id" and rr."title" = 'Spam'
where a."slug" = 'sandbox'
on conflict ("id") do nothing;

insert into "platform"."reports" (
  "id", "appId", "reporterUserId", "reportedUserId",
  "contentType", "contentRef", "contentSnapshot", "reasonId", "status", "resolvedAt"
)
select
  '00000000-0000-4000-e000-000000000002',
  a."id",
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  'posts',
  '00000000-0000-4000-c000-000000000003',
  'This one is already quarantined',
  rr."id",
  'resolved',
  now()
from "platform"."apps" a
join "platform"."reportReasons" rr on rr."appId" = a."id" and rr."title" = 'Harassment'
where a."slug" = 'sandbox'
on conflict ("id") do nothing;

insert into "platform"."reportResolutions" (
  "id", "reportId", "moderatorUserId",
  "subjectAction", "filerAction", "contentAction", "moderatorNote"
)
values (
  '00000000-0000-4000-f000-000000000001',
  '00000000-0000-4000-e000-000000000002',
  '00000000-0000-4000-a000-000000000003',
  'warn', 'no_action', 'quarantine',
  'Internal note. Never leaves the console -- my_reports() does not return it.'
)
on conflict ("id") do nothing;

-- The effect of that decision, applied the way the console applies it. Note
-- that the column points back at the resolution rather than holding a boolean:
-- "why is this hidden?" is a join, and deleting the decision un-hides it.
select "platform".apply_content_action(
  'sandbox', 'posts', '00000000-0000-4000-c000-000000000003',
  'quarantine', '00000000-0000-4000-f000-000000000001'
);
