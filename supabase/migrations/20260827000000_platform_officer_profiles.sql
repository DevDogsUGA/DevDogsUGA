-- ============================================================
-- The Leadership section reads profiles, so profiles have to carry it
-- ============================================================
--
-- The homepage's Leadership section read `execBoard` in
-- `apps/platform/src/app/(site)/homeData.ts`: nine object literals with
-- headshots imported from `~/assets`. It was placeholder content that had
-- drifted into being wrong -- six people on it are not on the board, four who
-- are were missing, and three of the names it did carry were given titles the
-- officers contradict in writing. Every entry shared one email address and one
-- org-wide GitHub and LinkedIn URL, which is how a placeholder announces
-- itself.
--
-- Officers are members. They already have `platform.profile` rows, roles in
-- `platform.roles`, avatars in the `avatars` bucket and links in
-- `platform."profileLinks"`. A second table describing the same people would
-- have been a second place for a name to be wrong, so there is not one -- this
-- migration only widens what the profile system already models.
--
-- Most of it was already here. `roles.isLeadership` marks a public-facing
-- role; `roles.rank` already orders them; `profile.preferredName` is why two
-- officers who submitted under a legal first name can be shown under the name
-- they use; `pronouns` is already `text[]`; `graduationSemester`/`Year`
-- already exist; `showLinkedin`/`showGithub`/`showEmail` are already the
-- consent flags that decide whether a contact route is published at all.
--
-- Two things were missing.

-- ============================================================
-- 1. A role description long enough to be a bio
-- ============================================================
--
-- `profile.roleDescription` was built for exactly this and never consumed. The
-- account page renders it only for leaders, under the description "A short
-- description of what you do, shown on the leadership section of the
-- homepage", and the comment beside it in account/page.tsx already says it is
-- "rendered on the homepage". It never was, because the homepage read a
-- hardcoded array instead. This migration is what makes that sentence true.
--
-- 127 characters is why it could not be. It shares `PROFILE_LIMITS.shortText`
-- with `profile.bio`, and the bios the officers submitted for the site run
-- 448 to 959 characters. 512 is the compromise the board asked for: enough
-- that nobody has to throw away what they wrote about their own work, short
-- enough that a hover card stays a card. `bio` keeps its 127 -- it is the
-- one-line profile blurb and means something different.
--
-- Widening a varchar does not rewrite the table; the existing values are
-- already inside the new bound.
alter table "platform"."profile"
  alter column "roleDescription" type varchar(512);

comment on column "platform"."profile"."roleDescription" is
  'The officer bio shown on the homepage Leadership section. Editable by the holder from /account, but only surfaced there for members whose roles include one with "isLeadership". Distinct from "bio", which is the 127-character blurb on the member''s own profile.';

-- ============================================================
-- 2. What the person actually studies
-- ============================================================
--
-- The leadership cards print majors, minors and certificates, and the profile
-- had nowhere to put them -- `graduationSemester` and `graduationYear` were
-- the whole of what it knew about anyone's degree. These sit beside those two
-- because they are the same kind of fact about the same person, not a
-- leadership decoration: a member page or the community directory can read
-- them without going anywhere new.
--
-- `not null default '{}'` so that "this member has no minor" and "nobody has
-- filled this in" are the same shape to every reader. That is the right call
-- for a list -- an empty list renders as nothing, which is what both mean --
-- and the wrong call for a scalar like `pronouns`, which stays nullable
-- precisely because those two states differ there.
--
-- No write path yet, deliberately. /account renders all three disabled: the
-- values come from the officer submissions for now, and a field a member can
-- edit needs validation, moderation and an audit story that none of this has.
alter table "platform"."profile"
  add column "majors" text[] not null default '{}',
  add column "minors" text[] not null default '{}',
  add column "certificates" text[] not null default '{}';

comment on column "platform"."profile"."majors" is
  'Degree programs, as printed. Read-only in the UI for now -- seeded from officer submissions, with no member-facing write path.';

-- The Leadership section's query is "every profile holding a role with
-- isLeadership, ordered by that role's rank". The join starts from userRoles,
-- so the index that matters is the one that finds leadership roles cheaply.
create index "roles_isLeadership_rank_idx"
  on "platform"."roles" ("rank")
  where "isLeadership";
