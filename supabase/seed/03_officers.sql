-- The 2026-27 executive board.
--
-- Content, so it lives with the content. The schema this needs --
-- `roleDescription` widened to 512, and the three academic array columns --
-- is 20260827000000_platform_officer_profiles.sql, and it has to be: a
-- migration is the only thing that reaches a database nobody is allowed to
-- drop. The seven people are a different kind of fact, and a file called
-- `03_officers.sql` says what it holds in a way a timestamped migration
-- cannot.
--
-- Seeds run on `supabase db reset` only, never on `db push` -- config.toml
-- says so where it opens the development-only gate, and 02_moderation.sql
-- leans on it. The board's plan is to reset before pushing to production,
-- which is what makes this the delivery path rather than a local fixture.
--
-- The consequence is worth stating once, because it arrives quietly: a reset
-- erases the database. That is fine now, before launch, and it stops being
-- fine the moment production carries attendance, ballots or teams that cannot
-- be dropped. After that point an edit here reaches contributors and nothing
-- else, and the officers' own content is maintained where they already
-- maintain it -- `roleDescription` and links from /account, titles and role
-- assignments from the console -- with a one-off migration for anything that
-- has to be corrected centrally.
--
-- Seeds run after migrations on a reset, so the columns below always exist by
-- the time this runs. Filename order puts it after 01_roles.sql, which is
-- what guarantees the Member and Root definitions are already there.
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
-- newer source. It is also what makes the file safe to replay, which a reset
-- does every time.
--
-- ============================================================
-- The bios
-- ============================================================
--
-- Third person throughout, and condensed to fit varchar(512) -- the submitted
-- text ran 448 to 959 characters. Nothing is invented and no claim is added;
-- where a sentence was cut it was cut whole. The full submitted text, in each
-- officer's original wording, is the copy of record in the private archive
-- alongside their resumes and the original emails.
--
-- Pronouns are set for exactly one officer, and that is not an oversight.
--
-- Armani Peacox has `she/her` because she wrote it herself: hers was the only
-- bio submitted in the third person, and it says "She serves as the Campus
-- Coordinator". That is a statement, not an inference, so it is recorded and
-- her bio keeps her wording.
--
-- Everyone else is null. No resume states pronouns, no bio uses them, and a
-- name is not evidence of them -- guessing from one is how a club's own
-- website misgenders its officers in public, and the neutral default never
-- does that. So the third-person rewrites lean on each officer's own name and
-- use they/them where a pronoun is unavoidable, and the card omits the line
-- entirely rather than printing a guess. `profile.pronouns` is editable from
-- /account: once officers fill theirs in, these sentences are worth another
-- pass.
--
-- ============================================================
-- Graduation dates
-- ============================================================
--
-- Read off each officer's resume in the private archive rather than guessed
-- from "sophomore", which is what the bios say and which does not pin a year.
-- Every one reads "May 20xx", so every semester below is 'spring'.
--
-- Two carry a caveat:
--
--   * Jack Harrington's resume lists a BS in May 2027 AND an MS in May 2028.
--     2027 is recorded, being the degree he is currently enrolled for, but the
--     field's stated purpose on /account is verifying student status -- and by
--     that reading 2028 is the truer answer. His to settle.
--   * Armani Peacox's resume gives a start (08/2025) and no expected end, so
--     hers stays null. Four years from a 2025 start would be a guess, and this
--     column feeds `profileWithVerification`.
--
-- Setting both halves matters beyond the card: `hasGraduationDate` in
-- `profileWithVerification` requires the semester AND the year, so these rows
-- move each officer a step toward verified.
--
-- ============================================================
-- Accounts, and the hazard in creating them
-- ============================================================
--
-- Officers are matched to `auth.users` case-insensitively, and one is created
-- where there is no such user. A
-- created row has no password and no `auth.identities` row, so it cannot sign
-- in -- it is a container holding submitted content until the person arrives.
-- The ids are in the same literal space as the moderation personas
-- (00000000-0000-4000-a000-...), one block along, so the two seeds cannot
-- collide.
--
-- Every officer is matched on their UGA MyID address -- the initials-plus-digits
-- form, supplied by the president -- because sign-in is UGA SSO and that is
-- the address the account will carry. Three officers submitted from personal
-- Gmail and two more from a uga.edu alias rather than the MyID; each of those
-- is kept in "altEmails" so a match still lands if an account was made under
-- one of them.
--
-- That closes the orphaning hazard this file used to carry. It is worth
-- keeping in view anyway: if an officer signs in under an address on neither
-- list, GoTrue mints a NEW user and the profile seeded here is stranded --
-- the card keeps the seeded content while the real account has none. Adding an
-- address here before a reset is cheap; merging two users afterwards is not.

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
  -- 'spring' | 'summer' | 'fall'. Cast to the enum on the way into profile.
  -- Every date below reads "May 20xx" on the resume, which is spring.
  "graduationSemester" text,
  -- Other addresses the same person may have signed in under. Matching checks
  -- these too, which is the cheapest defence against attaching a profile to
  -- the wrong account -- a mistake only discovered when somebody notices their
  -- card is a stranger's.
  "altEmails" text[] not null default '{}',
  -- Only set where the officer has actually said. See the pronouns note above.
  "pronouns" text[],
  -- Flipped on for officers with a GitHub or LinkedIn on record. They gate
  -- display of a LINKED OAuth identity, not the resume links seeded below, so
  -- today they change nothing visible -- nothing reads them yet either. They
  -- are set because the intent is recorded now, and whoever wires the display
  -- should not have to re-derive who consented.
  --
  -- Applied on INSERT ONLY, like "preferredName" and for a sharper reason:
  -- these are consent, and the column is `not null default false`, so a false
  -- read cannot tell "never set" from "deliberately switched off". Re-asserting
  -- on every replay would silently republish a link somebody had hidden. An
  -- existing profile therefore keeps whatever its owner last chose.
  "showGithub" boolean not null default false,
  "showLinkedin" boolean not null default false,
  -- Deterministic, so a replay finds the same row and so the headshot key in
  -- the `avatars` bucket -- which is the bare user id -- is knowable before
  -- the upload. Same literal space as the moderation personas
  -- (00000000-0000-4000-a000-...), one block along so they cannot collide.
  "seededId" uuid not null,
  "userId" uuid
);

insert into "officer_submissions" (
  "slug", "email", "preferredName", "title", "roleDescription",
  "majors", "minors", "certificates", "graduationYear", "graduationSemester",
  "altEmails", "pronouns", "showGithub", "showLinkedin", "seededId"
) values
  (
    'jack-harrington', 'jbh36784@uga.edu', 'Jack Harrington',
    'Vice President',
    'Jack Harrington is a Computer Science student at the University of Georgia with a passion for building full-stack software that solves real-world problems. As Vice President, Jack helps coordinate the student-led software projects DevDogs runs for the UGA community. As a Software Engineer Intern with the U.S. Air Force, they have built production software in a collaborative engineering environment, and they contribute to SpectraGuru, an open-source spectrum analysis platform for research.',
    array['Computer Science']::text[], '{}', '{}', 2027, 'spring',
    array['jackharrington290@gmail.com']::text[], null, true, true,
    '00000000-0000-4000-b000-000000000001'
  ),
  (
    'zayan-hoodani', 'zkh27085@uga.edu', 'Zayan Hoodani',
    'Event Director',
    'Zayan Hoodani is a sophomore studying Computer Science while pursuing a certificate in Cybersecurity and Privacy. As Event Director, Zayan facilitates events and works to create a fun, collaborative environment. They are a NetOps Intern at GreenSky, architecting automated systems for cloud network segmentation on AWS and provisioning physical switch infrastructure, and Director of R&D at The Hack Pack. Zayan loves anything to do with cybersecurity and AI.',
    array['Computer Science']::text[], '{}',
    array['Cybersecurity and Privacy']::text[], 2028, 'spring',
    array['zayanhoodani@gmail.com']::text[], null, false, true,
    '00000000-0000-4000-b000-000000000002'
  ),
  (
    'nandan-praveen', 'np43598@uga.edu', 'Nandan Praveen',
    'Flutter Project Head',
    'Nandan Praveen is a sophomore majoring in Computer Systems Engineering, currently serving as Flutter Project Head and formerly a Focus Lead at DevDogs. Their work spans Flutter, Next.js, MySQL, and Supabase, orchestrating both the UI/UX of the app and the backend while helping developers grow in core and advanced concepts. Outside DevDogs, Nandan does ML research with UGA''s VIPR lab, building image-based models using PyTorch and TensorFlow.',
    array['Computer Systems Engineering']::text[], '{}', '{}', 2029, 'spring',
    array['nandan@uga.edu']::text[], null, true, false,
    '00000000-0000-4000-b000-000000000003'
  ),
  (
    'shruti-mishra', 'sbm64430@uga.edu', 'Shruti Mishra',
    'Focus Lead, Backend Integration',
    'Shruti Mishra is a sophomore at the University of Georgia studying Computer Science with an emphasis in Artificial Intelligence. Shruti serves as the Focus Lead for Backend Integration on the DevDogs leadership team, is a member of the UGAHacks Tech Team helping develop the website for UGA''s annual hackathon, and serves on the Outreach Team for HackPack, UGA''s cybersecurity club. They are passionate about software engineering and AI.',
    array['Computer Science']::text[], '{}', '{}', 2027, 'spring',
    array['shruti.mishra@uga.edu', 'shrutibmishra1@gmail.com']::text[],
    null, true, false,
    '00000000-0000-4000-b000-000000000004'
  ),
  (
    -- Submitted as Ashlee Peacox; Armani is the name she goes by. Her wording,
    -- her pronouns -- see the note above.
    'armani-peacox', 'aap86342@uga.edu', 'Armani Peacox',
    'Campus Coordinator',
    'Armani is a Computer Science and Interdisciplinary Art student at the University of Georgia with a passion for game development. She serves as the Campus Coordinator for UGA''s Dev Dogs chapter and is actively involved in TheHackPack, Girls Who Code, and the Powerlifting & Bodybuilding Club. Her interests include gameplay programming, game design, virtual and augmented reality, human-computer interaction, and digital art.',
    array['Computer Science', 'Interdisciplinary Art']::text[], '{}',
    array['New Media']::text[], null, null,
    array['ashlee.peacox@uga.edu']::text[],
    array['she', 'her']::text[], false, false,
    '00000000-0000-4000-b000-000000000005'
  ),
  (
    'gabrielle-rose', 'glr26038@uga.edu', 'Gabrielle Rose',
    'UI/UX Focus Lead',
    'Gabrielle Rose is pursuing a degree in Computer Science with a focus on front-end development, human-computer interaction, and UI/UX design, and is passionate about creating intuitive, user-centered technologies that solve real-world problems. In the future, Gabrielle aspires to bridge the gap between people and technology by designing digital solutions that create meaningful impact and empower communities to confidently engage with technology.',
    array['Computer Science']::text[], '{}', '{}', 2028, 'spring',
    array['gabrielle.rose@uga.edu']::text[], null, false, true,
    '00000000-0000-4000-b000-000000000006'
  ),
  (
    -- Submitted as Gia Khang Quach; Kyle is the name he goes by there --
    -- his own resume prints linkedin.com/in/kyle-quach.
    'kyle-quach', 'gq72484@uga.edu', 'Kyle Quach',
    'Next.js Focus Lead',
    'Kyle Quach is a sophomore majoring in Computer Science at the University of Georgia. Kyle''s interests span software development to AI engineering, and they sometimes develop games on the side. They have built projects with tech stacks such as Java, C#, Python, and JavaScript, as well as frameworks like React and Spring. As an aspiring software developer, Kyle looks forward to building software that contributes meaningfully to people''s daily lives.',
    array['Computer Science']::text[], '{}', '{}', 2028, 'spring',
    array['giakhang.quach@uga.edu']::text[], null, true, true,
    '00000000-0000-4000-b000-000000000007'
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
-- 2026-08-27; his row is the commented-out block at the foot of this file,
-- waiting on a reviewed bio and the address his account uses.
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
  ('UI/UX Focus Lead', 6),
  ('Next.js Focus Lead', 7),
  ('Campus Coordinator', 8)
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
  select 1 from "auth"."users" u
  where lower(u."email") = s."email"
     or lower(u."email") = any (s."altEmails")
)
on conflict ("id") do nothing;

update "officer_submissions" s
set "userId" = u."id"
from "auth"."users" u
where lower(u."email") = s."email"
   or lower(u."email") = any (s."altEmails");

-- ============================================================
-- Profiles
-- ============================================================
--
-- `preferredName` is NOT NULL and so can only be supplied on insert; an
-- existing profile keeps whatever name its owner chose. Everything else is
-- coalesced or replaced-only-when-empty.
insert into "platform"."profile" (
  "userId", "preferredName", "roleDescription",
  "majors", "minors", "certificates",
  "graduationYear", "graduationSemester", "pronouns",
  "showGithub", "showLinkedin"
)
select
  s."userId", s."preferredName", s."roleDescription",
  s."majors", s."minors", s."certificates",
  s."graduationYear",
  s."graduationSemester"::"platform"."graduationSemester",
  s."pronouns", s."showGithub", s."showLinkedin"
from "officer_submissions" s
where s."userId" is not null
on conflict ("userId") do update set
  "roleDescription" = coalesce(
    "platform"."profile"."roleDescription", excluded."roleDescription"
  ),
  "graduationYear" = coalesce(
    "platform"."profile"."graduationYear", excluded."graduationYear"
  ),
  "graduationSemester" = coalesce(
    "platform"."profile"."graduationSemester", excluded."graduationSemester"
  ),
  "pronouns" = coalesce(
    "platform"."profile"."pronouns", excluded."pronouns"
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

-- ============================================================
-- Links
-- ============================================================
--
-- Every one of these is printed on the officer's own resume -- the document
-- they sent to be used on the website. None was found by searching for them:
-- attaching a profile to a named student on a public page on the strength of a
-- name match is how the wrong person ends up on the site, and a resume is both
-- certain and already offered.
--
-- Armani Peacox lists none. Her resume carries an email and a phone number and
-- nothing else, so she has none here; asking her is the fix.
--
-- Note what is NOT taken from those resumes: phone numbers, street addresses
-- and personal email. Gabrielle's LinkedIn shares a header line with her mobile
-- number, and only the URL crossed over.
--
-- These go to `profileLinks`, the list members curate from /account, so an
-- officer can delete or reorder any of them without asking anybody. GitHub and
-- LinkedIn are separately modelled as linked OAuth identities gated on
-- `showGithub`/`showLinkedin`, which is the better long-term home because it
-- proves the account is theirs -- but it needs each officer to link it, and
-- none has yet.
--
-- Gap-filled as a set: an officer who has added any link of their own owns
-- that list, and these do not push into it.
create temporary table "officer_links" (
  "slug" text not null,
  "title" text not null,
  "url" text not null,
  "sortOrder" integer not null
);

insert into "officer_links" ("slug", "title", "url", "sortOrder") values
  ('jack-harrington', 'LinkedIn',  'https://www.linkedin.com/in/jackharrington2006/', 0),
  ('jack-harrington', 'GitHub',    'https://github.com/JackHarrington3', 1),
  ('zayan-hoodani',   'Portfolio', 'https://zayan.hoodani.me/', 0),
  ('zayan-hoodani',   'LinkedIn',  'https://www.linkedin.com/in/zayanh1/', 1),
  ('nandan-praveen',  'Portfolio', 'https://nandanpraveen.github.io', 0),
  -- Not printed on his resume as a github.com URL, but the resume's own
  -- portfolio link is nandanpraveen.github.io, and that account resolves to
  -- GitHub user 97852696 named "Nandan Praveen". Derived, then verified.
  ('nandan-praveen',  'GitHub',    'https://github.com/nandanpraveen', 1),
  ('shruti-mishra',   'GitHub',    'https://github.com/smcodes612', 0),
  ('gabrielle-rose',  'LinkedIn',  'https://www.linkedin.com/in/gabrielle-rose-b79b00308/', 0),
  ('kyle-quach',      'LinkedIn',  'https://www.linkedin.com/in/kyle-quach/', 0),
  ('kyle-quach',      'GitHub',    'https://github.com/kquakk', 1);

insert into "platform"."profileLinks" ("userId", "title", "url", "sortOrder")
select s."userId", l."title", l."url", l."sortOrder"
from "officer_links" l
join "officer_submissions" s on s."slug" = l."slug"
where s."userId" is not null
  and not exists (
    select 1 from "platform"."profileLinks" p where p."userId" = s."userId"
  )
on conflict do nothing;

drop table "officer_links";

-- Assignments. Officers who stated no title have none to assign.
insert into "platform"."userRoles" ("userId", "roleId")
select s."userId", r."id"
from "officer_submissions" s
join "platform"."roles" r on r."title" = s."title"
where s."userId" is not null and s."title" is not null
on conflict do nothing;

drop table "officer_submissions";

-- ============================================================
-- Sloan Finger, President
-- ============================================================
--
-- Separate from the block above because he sent no submission: there is no
-- resume, no headshot email and no bio in his own words. What is here was
-- confirmed directly -- the address, spring 2027, and the presidency -- plus a
-- bio drafted for him and accepted as a placeholder he intends to rewrite.
--
-- No pronouns here either, for the same reason as everyone else: they have
-- not been stated, and the president is owed the same default as the officers.
--
-- His headshot is the `apps/platform/src/assets/sloan.jpg` this branch deleted
-- along with the other placeholder headshots, recovered into the archive and
-- derived to `web/sloan-finger.webp` for the avatars bucket.
insert into "auth"."users" (
  "id", "instance_id", "aud", "role", "email",
  "raw_app_meta_data", "raw_user_meta_data",
  "confirmation_token", "recovery_token",
  "email_change_token_new", "email_change",
  "created_at", "updated_at"
)
select
  '00000000-0000-4000-b000-000000000008',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'jsf51288@uga.edu',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', now(), now()
where not exists (
  select 1 from "auth"."users" u where lower(u."email") = 'jsf51288@uga.edu'
)
on conflict ("id") do nothing;

insert into "platform"."profile" (
  "userId", "preferredName", "roleDescription",
  "majors", "graduationYear", "graduationSemester"
)
select u."id", 'Sloan Finger',
  'Sloan Finger is President of DevDogs, leading the executive board and the '
  'club''s software projects. A University of Georgia student graduating in '
  'spring 2027, Sloan built and maintains the DevDogs platform -- this site '
  'and the console the club runs on -- and works on the developer tooling and '
  'deployment infrastructure behind them.',
  array['Computer Science', 'Sociology']::text[], 2027, 'spring'
from "auth"."users" u
where lower(u."email") = 'jsf51288@uga.edu'
on conflict ("userId") do update set
  "roleDescription" = coalesce(
    "platform"."profile"."roleDescription", excluded."roleDescription"
  ),
  "graduationYear" = coalesce(
    "platform"."profile"."graduationYear", excluded."graduationYear"
  ),
  "graduationSemester" = coalesce(
    "platform"."profile"."graduationSemester", excluded."graduationSemester"
  );

insert into "platform"."userRoles" ("userId", "roleId")
select u."id", r."id"
from "auth"."users" u, "platform"."roles" r
where lower(u."email") = 'jsf51288@uga.edu' and r."title" = 'President'
on conflict do nothing;
