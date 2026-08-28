-- ============================================================
-- The 2026-27 executive board
-- ============================================================
--
-- Content in a migration, which needs justifying twice over -- once for being
-- content, and once for not being in supabase/seed/.
--
-- Not a seed, because a seed cannot get here. config.toml says it plainly:
-- "Seeds run on `supabase db reset` only, never on `db push`". The deploy
-- workflow applies the database with `supabase db push` (deploy.yaml), so a
-- file under supabase/seed/ reaches a contributor's laptop and nothing else.
-- This is the club's real leadership, and the homepage that reads it is the
-- deployed one.
--
-- Not a script either. `seed-builtin-roles.ts` exists because Root has to be
-- bootstrapped onto whichever account happens to be first, which is a decision
-- no static file can make. Nothing here is that kind of decision -- it is a
-- fixed list of seven people -- and a migration already runs in every
-- environment automatically, including locally, since `db reset` replays
-- migrations before it runs seeds. A script would have added a step someone
-- has to remember instead.
--
-- Row inserts in a migration are established here: the app registry
-- (20260730000000), report reasons (20260807000000), docs (20260707000000)
-- and the Airtable sync tables (20260803000006) all do it.
--
-- ============================================================
-- Filling gaps, never overwriting
-- ============================================================
--
-- Every write below is a gap-fill: `coalesce` for scalars,
-- replace-only-when-empty for the arrays, `on conflict do nothing` for the
-- rest. An officer who has already written their own role description, set
-- their own graduation year or picked their own preferred name keeps every bit
-- of it. That matters more than it looks -- these submissions were emailed in
-- July, `roleDescription` is editable from /account, and the account is the
-- newer source. It also makes this file safe to replay, which `db reset` does
-- on every contributor machine.
--
-- ============================================================
-- The bios
-- ============================================================
--
-- Third person throughout, and condensed to fit varchar(512) -- the submitted
-- text ran 448 to 959 characters. Nothing is invented and no claim is added;
-- where a sentence was cut it was cut whole. The full submitted text, in each
-- officer's original wording, is the copy of record in the private archive.
--
-- ⚠️ No officer stated their pronouns, and a name is not evidence of them, so
-- the third-person rewrites lean on each officer's own name and use they/them
-- where a pronoun is unavoidable. Armani Peacox is the exception: hers was the
-- only bio submitted in the third person already, and it is kept in her
-- wording, including the pronouns she chose for herself. `profile.pronouns`
-- exists and is empty for all seven; once officers fill it in, these
-- sentences are worth revisiting.
--
-- ============================================================
-- Accounts, and the hazard in creating them
-- ============================================================
--
-- Officers are matched to `auth.users` on the address they submitted from,
-- case-insensitively, and one is created where there is no such user. A
-- created row has no password and no `auth.identities` row, so it cannot sign
-- in -- it is a container holding submitted content until the person arrives.
--
-- Three officers wrote from personal Gmail, which is the only address known
-- for them. If one of them later signs in through GitHub, Discord or LinkedIn
-- under a different address, GoTrue mints a NEW user and the profile seeded
-- here is orphaned: the card keeps the seeded content while the real account
-- has none. Correcting an address is a one-line follow-up migration; merging
-- two users afterwards is not.

create temporary table "officer_submissions" (
  "slug" text primary key,
  "email" text not null,
  "preferredName" text not null,
  "title" text,
  "roleDescription" text not null,
  "majors" text[] not null,
  "minors" text[] not null,
  "certificates" text[] not null,
  "graduationYear" integer,
  "linkTitle" text,
  "linkUrl" text,
  -- Deterministic, so a replay finds the same row and so the headshot key in
  -- the `avatars` bucket -- which is the bare user id -- is knowable before
  -- the upload. Same literal space as the moderation personas
  -- (00000000-0000-4000-a000-...), one block along so they cannot collide.
  "seededId" uuid not null,
  "userId" uuid
);

insert into "officer_submissions" (
  "slug", "email", "preferredName", "title", "roleDescription",
  "majors", "minors", "certificates", "graduationYear",
  "linkTitle", "linkUrl", "seededId"
) values
  (
    'jack-harrington', 'jackharrington290@gmail.com', 'Jack Harrington',
    'Vice President',
    'Jack Harrington is a Computer Science student at the University of Georgia with a passion for building full-stack software that solves real-world problems. As Vice President, Jack helps coordinate the student-led software projects DevDogs runs for the UGA community. As a Software Engineer Intern with the U.S. Air Force, they have built production software in a collaborative engineering environment, and they contribute to SpectraGuru, an open-source spectrum analysis platform for research.',
    array['Computer Science']::text[], '{}', '{}', null,
    null, null, '00000000-0000-4000-b000-000000000001'
  ),
  (
    'zayan-hoodani', 'zayanhoodani@gmail.com', 'Zayan Hoodani',
    'Event Director',
    'Zayan Hoodani is a sophomore studying Computer Science while pursuing a certificate in Cybersecurity and Privacy. As Event Director, Zayan facilitates events and works to create a fun, collaborative environment. They are a NetOps Intern at GreenSky, architecting automated systems for cloud network segmentation on AWS and provisioning physical switch infrastructure, and Director of R&D at The Hack Pack. Zayan loves anything to do with cybersecurity and AI.',
    array['Computer Science']::text[], '{}',
    array['Cybersecurity and Privacy']::text[], null,
    'Portfolio', 'https://zayan.hoodani.me/', '00000000-0000-4000-b000-000000000002'
  ),
  (
    'nandan-praveen', 'nandan@uga.edu', 'Nandan Praveen',
    'Flutter Project Head',
    'Nandan Praveen is a sophomore majoring in Computer Systems Engineering, currently serving as Flutter Project Head and formerly a Focus Lead at DevDogs. Their work spans Flutter, Next.js, MySQL, and Supabase, orchestrating both the UI/UX of the app and the backend while helping developers grow in core and advanced concepts. Outside DevDogs, Nandan does ML research with UGA''s VIPR lab, building image-based models using PyTorch and TensorFlow.',
    array['Computer Systems Engineering']::text[], '{}', '{}', 2029,
    null, null, '00000000-0000-4000-b000-000000000003'
  ),
  (
    'shruti-mishra', 'shrutibmishra1@gmail.com', 'Shruti Mishra',
    'Focus Lead, Backend Integration',
    'Shruti Mishra is a sophomore at the University of Georgia studying Computer Science with an emphasis in Artificial Intelligence. Shruti serves as the Focus Lead for Backend Integration on the DevDogs leadership team, is a member of the UGAHacks Tech Team helping develop the website for UGA''s annual hackathon, and serves on the Outreach Team for HackPack, UGA''s cybersecurity club. They are passionate about software engineering and AI.',
    array['Computer Science']::text[], '{}', '{}', null,
    null, null, '00000000-0000-4000-b000-000000000004'
  ),
  (
    -- Submitted as Ashlee Peacox; Armani is the name she goes by. Her wording,
    -- her pronouns -- see the note above.
    'armani-peacox', 'ashlee.peacox@uga.edu', 'Armani Peacox',
    'Campus Coordinator',
    'Armani is a Computer Science and Interdisciplinary Art student at the University of Georgia with a passion for game development. She serves as the Campus Coordinator for UGA''s Dev Dogs chapter and is actively involved in TheHackPack, Girls Who Code, and the Powerlifting & Bodybuilding Club. Her interests include gameplay programming, game design, virtual and augmented reality, human-computer interaction, and digital art.',
    array['Computer Science', 'Interdisciplinary Art']::text[], '{}', '{}', null,
    null, null, '00000000-0000-4000-b000-000000000005'
  ),
  (
    -- No DevDogs title stated, so no role is assigned and this profile does
    -- not appear on the homepage. The data is still hers.
    'gabrielle-rose', 'gabrielle.rose@uga.edu', 'Gabrielle Rose',
    null,
    'Gabrielle Rose is pursuing a degree in Computer Science with a focus on front-end development, human-computer interaction, and UI/UX design, and is passionate about creating intuitive, user-centered technologies that solve real-world problems. In the future, Gabrielle aspires to bridge the gap between people and technology by designing digital solutions that create meaningful impact and empower communities to confidently engage with technology.',
    array['Computer Science']::text[], '{}', '{}', null,
    null, null, '00000000-0000-4000-b000-000000000006'
  ),
  (
    -- Submitted as Gia Khang Quach; Kyle is the name he goes by. Also
    -- untitled, so also not on the homepage.
    'kyle-quach', 'giakhang.quach@uga.edu', 'Kyle Quach',
    null,
    'Kyle Quach is a sophomore majoring in Computer Science at the University of Georgia. Kyle''s interests span software development to AI engineering, and they sometimes develop games on the side. They have built projects with tech stacks such as Java, C#, Python, and JavaScript, as well as frameworks like React and Spring. As an aspiring software developer, Kyle looks forward to building software that contributes meaningfully to people''s daily lives.',
    array['Computer Science']::text[], '{}', '{}', null,
    null, null, '00000000-0000-4000-b000-000000000007'
  );

-- ============================================================
-- Officer titles as leadership roles
-- ============================================================
--
-- `isLeadership` is what the homepage selects on and what
-- `resolvedUserPermissions` reads for `isLeader` -- which is also the flag
-- that reveals the Role Description field on /account. Marking these roles
-- leadership is therefore what lets each officer edit the bio their own card
-- prints, which is the point.
--
-- Ranks are allocated above the current maximum rather than fixed: `rank` is
-- UNIQUE and `roles_custom_requires_rank` ties a non-null rank to roleType
-- 'custom', so a hardcoded number would collide with whatever the console has
-- already created. No existing role is leadership, so appending still orders
-- the board correctly among the roles that matter. An existing role keeps its
-- rank and colour -- an officer may have reordered it since.
--
-- President is created and NOT assigned. Sloan Finger holds it as of
-- 2026-08-27 and submitted no bio or headshot; inventing either would be
-- worse than an empty seat. Assigning it is one row in "userRoles".
--
-- No permissions are granted. Every `can*` column is left null, which resolves
-- to false -- being on the homepage is not a reason to gain moderation rights.
insert into "platform"."roles"
  ("title", "description", "roleType", "rank", "isLeadership", "showOnProfile")
select
  t."title",
  t."title" || ' of DevDogs.',
  'custom',
  (select coalesce(max("rank"), 0) from "platform"."roles") + t."ord",
  true,
  true
from (values
  ('President', 1),
  ('Vice President', 2),
  ('Event Director', 3),
  ('Flutter Project Head', 4),
  ('Focus Lead, Backend Integration', 5),
  ('Campus Coordinator', 6)
) as t("title", "ord")
on conflict ("title") do update set
  "isLeadership" = true,
  "showOnProfile" = true;

-- ============================================================
-- Accounts
-- ============================================================
--
-- The four empty strings are not decoration, and 02_moderation.sql explains
-- why: GoTrue scans confirmation_token, recovery_token,
-- email_change_token_new and email_change into non-nullable Go strings, and
-- those columns have no database default, so a row without them exists but
-- fails every sign-in with an error naming neither the column nor the user.
insert into "auth"."users" (
  "id", "instance_id", "aud", "role", "email",
  "raw_app_meta_data", "raw_user_meta_data",
  "confirmation_token", "recovery_token",
  "email_change_token_new", "email_change",
  "created_at", "updated_at"
)
select
  s."seededId", '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', s."email",
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', now(), now()
from "officer_submissions" s
where not exists (
  select 1 from "auth"."users" u where lower(u."email") = s."email"
)
on conflict ("id") do nothing;

update "officer_submissions" s
set "userId" = u."id"
from "auth"."users" u
where lower(u."email") = s."email";

-- ============================================================
-- Profiles
-- ============================================================
--
-- `preferredName` is NOT NULL and so can only be supplied on insert; an
-- existing profile keeps whatever name its owner chose. Everything else is
-- coalesced or replaced-only-when-empty.
insert into "platform"."profile" (
  "userId", "preferredName", "roleDescription",
  "majors", "minors", "certificates", "graduationYear"
)
select
  s."userId", s."preferredName", s."roleDescription",
  s."majors", s."minors", s."certificates", s."graduationYear"
from "officer_submissions" s
where s."userId" is not null
on conflict ("userId") do update set
  "roleDescription" = coalesce(
    "platform"."profile"."roleDescription", excluded."roleDescription"
  ),
  "graduationYear" = coalesce(
    "platform"."profile"."graduationYear", excluded."graduationYear"
  ),
  "majors" = case
    when cardinality("platform"."profile"."majors") = 0
    then excluded."majors" else "platform"."profile"."majors" end,
  "minors" = case
    when cardinality("platform"."profile"."minors") = 0
    then excluded."minors" else "platform"."profile"."minors" end,
  "certificates" = case
    when cardinality("platform"."profile"."certificates") = 0
    then excluded."certificates" else "platform"."profile"."certificates" end;

-- Links are gap-filled as a set: an officer who has added any link of their
-- own owns that list, and a submitted link does not push into it.
insert into "platform"."profileLinks" ("userId", "title", "url", "sortOrder")
select s."userId", s."linkTitle", s."linkUrl", 0
from "officer_submissions" s
where s."userId" is not null
  and s."linkUrl" is not null
  and not exists (
    select 1 from "platform"."profileLinks" l where l."userId" = s."userId"
  )
on conflict do nothing;

-- Assignments. Officers who stated no title have none to assign.
insert into "platform"."userRoles" ("userId", "roleId")
select s."userId", r."id"
from "officer_submissions" s
join "platform"."roles" r on r."title" = s."title"
where s."userId" is not null and s."title" is not null
on conflict do nothing;

drop table "officer_submissions";
