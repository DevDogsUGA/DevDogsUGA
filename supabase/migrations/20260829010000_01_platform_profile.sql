-- ============================================================
-- Member profiles
-- ============================================================
--
-- The "graduationSemester" enum, platform.profile and platform."profileLinks",
-- the "profileWithVerification" view, and the four policies whose predicates
-- are already final here.
--
-- The one thing to know before editing this file: the table is created with a
-- table-wide UPDATE grant it must not keep. The schemas file's `alter default
-- privileges ... grant all on tables` is the only source of table privileges in
-- this repo, so profile is born writable in every column. The `revoke update`
-- and the eleven-column `grant update` at the bottom are what take that back,
-- they only work in that order, and the column list is now the only thing
-- standing between a browser and a member's legal name. Read the warning above
-- the grant before touching it.

create type "platform"."graduationSemester" as enum ('spring', 'summer', 'fall');


-- ============================================================
-- profile
-- ============================================================
--
-- Two sets of name columns, which otherwise read as duplication.
--
--   involvement*        Is this person on the CURRENT roster. The Involvement
--                       CSV import nulls these across every row and then
--                       repopulates from the CSV, so they go false when
--                       somebody drops off. That is what they are for.
--   legal*, ugaEmail    Who this person is, durably. Never cleared.
--
-- Pushing involvement* to Airtable as a legal name would blank the field for
-- every member who graduated, took a semester off, or was missing from one CSV,
-- and blanking a dues record's name is silent loss.
--
-- ugaEmail is also distinct from auth.users.email, which holds whatever address
-- the member signed up with, a Gmail address for anyone who came in through
-- Google or Discord before appearing on a roster. Nothing marks an address
-- there as institutional, so a sync keyed on it keys on the wrong thing.
--
-- "roleDescription" is varchar(512) and "bio" is varchar(127). They are not the
-- same field at different sizes: bio is the one-line blurb on the member's own
-- profile, roleDescription is the officer bio rendered on the homepage
-- Leadership section, and the bios officers actually submitted run 448 to 959
-- characters. 512 is the board's compromise.
--
-- majors, minors and certificates are `not null default '{}'` so that "no
-- minor" and "not filled in" are one shape to every reader. An empty list
-- renders as nothing, which is what both mean. "pronouns" stays nullable
-- precisely because those two states differ for a scalar.
--
-- Column order below is deliberate and matches the order the old migrations
-- added them in. Nothing depends on it, but a diff against a live database
-- is easier to read when attnum lines up.
--
-- "quarantinedBy" is NOT here. It has to land after the revoke and grant below,
-- and it references a table three files later. See file 26.
create table "platform"."profile" (
  "userId" uuid not null,
  "preferredName" character varying(255) not null,
  "bio" character varying(127),
  "pronouns" text[],
  "graduationSemester" platform."graduationSemester",
  "graduationYear" integer,
  "showGithub" boolean not null default false,
  "showDiscord" boolean not null default false,
  "showEmail" boolean not null default false,
  "showLinkedin" boolean not null default false,
  "viewedConsole" boolean not null default false,
  "involvementFirstName" text,
  "involvementLastName" text,
  "involvementImportedAt" timestamp without time zone,
  "roleDescription" character varying(512),
  "ugaEmail" text,
  "legalFirstName" text,
  "legalLastName" text,
  "identitySourcedAt" timestamptz,
  "majors" text[] not null default '{}',
  "minors" text[] not null default '{}',
  "certificates" text[] not null default '{}'
);

alter table "platform"."profile" enable row level security;

-- Up to five titled URLs rendered on the same public profile page as the bio.
-- The unique on ("userId", "sortOrder") is what makes reordering a swap rather
-- than a renumber.
create table "platform"."profileLinks" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "url" text not null,
  "title" character varying(64) not null,
  "sortOrder" double precision not null default 0,
  "createdAt" timestamp without time zone default now()
);

alter table "platform"."profileLinks" enable row level security;


-- ============================================================
-- Keys, indexes and foreign keys
-- ============================================================

create unique index profile_pkey on platform.profile using btree ("userId");

create unique index "profileLinks_pkey" on platform."profileLinks" using btree (id);

create unique index "profileLinks_userId_sortOrder_key" on platform."profileLinks" using btree ("userId", "sortOrder");

alter table "platform"."profile"
  add constraint "profile_pkey" primary key using index "profile_pkey";

alter table "platform"."profileLinks"
  add constraint "profileLinks_pkey" primary key using index "profileLinks_pkey";

alter table "platform"."profileLinks"
  add constraint "profileLinks_userId_sortOrder_key" unique using index "profileLinks_userId_sortOrder_key";

alter table "platform"."profile"
  add constraint "profile_userId_users_id_fkey"
  foreign key ("userId") references auth.users(id) on update cascade on delete cascade;

alter table "platform"."profileLinks"
  add constraint "profileLinks_userId_profile_userId_fkey"
  foreign key ("userId") references platform.profile("userId") on update cascade on delete cascade;

-- Case-folded rather than case-sensitive: MyID addresses are handed out in one
-- case and typed in another, and two spellings of one address would become two
-- member rows in Airtable. `citext` would say this directly, but it is an
-- extension type (extensions.citext under Supabase's layout) and drizzle-kit
-- cannot introspect it into the generated schema. A check plus a plain unique
-- index gives the identical guarantee in types Drizzle already understands. Do
-- not substitute citext here.
alter table "platform"."profile"
  add constraint "profile_ugaEmail_lowercase"
  check ("ugaEmail" is null or "ugaEmail" = lower("ugaEmail"));

create unique index "profile_ugaEmail_key"
  on "platform"."profile" ("ugaEmail");

-- The unique is why the Airtable attendance import must leave "ugaEmail" null
-- on accounts it creates. That import takes a MyID off a form nobody checked.
-- If a mistyped address were already sitting in this column under somebody
-- else's account, the Involvement roster import, which writes "ugaEmail" for
-- every roster member inside one transaction, would raise a unique violation
-- and abort. One typo in a form would break the import for the whole club.
comment on index "platform"."profile_ugaEmail_key" is
  'Unique, and written only by the Involvement roster import. The Airtable attendance import deliberately leaves "ugaEmail" null on accounts it creates: a self-declared MyID landing here would make one typo abort the next roster import for everybody.';


-- ============================================================
-- profileWithVerification
-- ============================================================
--
-- `security_invoker = true` is load-bearing. The view has no RLS of its own and
-- relies entirely on profile's own-row-only SELECT policy applying to the
-- caller. Drop the option and the view runs as its owner and returns every
-- member's verification state to anyone who can read it.
create or replace view "platform"."profileWithVerification" with (security_invoker = true) as  SELECT "userId",
    ((pronouns IS NOT NULL) AND (array_length(pronouns, 1) > 0)) AS "hasPronouns",
    (("graduationSemester" IS NOT NULL) AND ("graduationYear" IS NOT NULL)) AS "hasGraduationDate",
    (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))) AS "hasGithub",
    (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text)))) AS "hasDiscord",
    (("involvementFirstName" IS NOT NULL) AND (lower(TRIM(BOTH FROM "preferredName")) = lower(((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName"))))) AS "nameMatchesInvolvement",
    ((pronouns IS NOT NULL) AND (array_length(pronouns, 1) > 0) AND ("graduationSemester" IS NOT NULL) AND ("graduationYear" IS NOT NULL) AND ("involvementFirstName" IS NOT NULL) AND (lower(TRIM(BOTH FROM "preferredName")) = lower(((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")))) AND (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))) AND (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text))))) AS verified
   FROM platform.profile p;


-- ============================================================
-- Policies: the four whose predicates are final here
-- ============================================================
--
-- Both tables carry four policies each under the same four names. This file
-- creates only the four that will never change again:
--
--   profile        delete, insert, select
--   profileLinks   select
--
-- The other four (profile update, profileLinks insert/update/delete) gain a
-- freeze and suspension check and are created in final form in file 26, which
-- is the first point where platform.is_profile_frozen and platform.is_suspended
-- exist. A policy predicate is parsed at CREATE POLICY time, so they cannot be
-- written here. Do not add placeholder versions: file 26 creates them outright.
--
-- There are no anon policies on either table, on purpose. anon holds table
-- grants from the schema-wide default privileges and is stopped by RLS alone.
-- That is the repo-wide model and the conformance check reasons about it.

-- Restrictive with a constant false, not an absent policy. Rows are created and
-- removed server-side; a member may never insert or delete their own profile.
-- Restrictive is the load-bearing word: as a permissive policy these would be
-- inert, since permissive policies are OR'd and another one could open the gate.
create policy "crud_authenticated_policy_delete"
  on "platform"."profile"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."profile"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."profile"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));

-- Reads of a member's own links. This one is never amended: a frozen member
-- still gets to see the links a moderator froze.
create policy "crud_authenticated_policy_select"
  on "platform"."profileLinks"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));


-- ============================================================
-- Which columns a browser may write
-- ============================================================
--
-- platform.profile is written straight from the browser through PostgREST, and
-- its UPDATE policy is a permissive `auth.uid() = "userId"`. That policy decides
-- WHICH ROW, not which columns. Without the two statements below a member could
-- set their own "ugaEmail" or "legal*" and rewrite the identity a dues record is
-- keyed on.
--
-- Column grants only work in one direction. A `revoke update ("ugaEmail")`
-- against a table-wide UPDATE grant does nothing at all. The table-wide grant
-- has to go first, then come back per column, in that order, after the CREATE
-- TABLE. File 25's conformance check asserts this exact shape for app schemas.
revoke update on "platform"."profile" from authenticated, anon;

-- ---- WARNING: this list is incomplete ON PURPOSE. Do not "finish" it. ----
--
-- Eleven columns. Everything absent from this list is client-unwritable, and
-- since the table above is now declared in one piece, this list is the ONLY
-- thing keeping it that way:
--
--   majors, minors, certificates    no write path yet. Values come from officer
--                                   submissions, /account renders all three
--                                   disabled, and a member-editable field needs
--                                   validation, moderation and an audit story.
--   ugaEmail, legalFirstName,       durable identity, sourced from the roster,
--   legalLastName,                  never from self-declaration.
--   identitySourcedAt
--   involvement*                    roster import writes these, nobody else.
--   quarantinedBy                   added in file 26, after this grant, which
--                                   is exactly what makes a frozen member
--                                   unable to unfreeze themselves.
--
-- In the old migration history those columns were added after this grant ran,
-- so their absence was automatic. Writing the table in final form moves them
-- above it for the first time. Adding a name here is a privilege change, not
-- tidying.
--
-- Two entries are arguably too generous already: "graduationSemester" and
-- "graduationYear" are only ever written by updateGraduation.ts, which checks
-- the date is in the future, and a direct PostgREST write skips that check.
-- Narrowing them is its own change.
grant update (
  "preferredName",
  "bio",
  "pronouns",
  "graduationSemester",
  "graduationYear",
  "showGithub",
  "showDiscord",
  "showEmail",
  "showLinkedin",
  "viewedConsole",
  "roleDescription"
) on "platform"."profile" to authenticated;


-- ============================================================
-- Column documentation
-- ============================================================

comment on column "platform"."profile"."ugaEmail" is
  'Institutional address from the Involvement roster. Durable identity: never cleared by an import. Distinct from auth.users.email, which is whatever the member signed up with.';

comment on column "platform"."profile"."legalFirstName" is
  'Name of record from the Involvement roster. Never cleared by an import -- see "involvementFirstName" for current-roster status.';

comment on column "platform"."profile"."legalLastName" is
  'Name of record from the Involvement roster. Never cleared by an import -- see "involvementLastName" for current-roster status.';

comment on column "platform"."profile"."identitySourcedAt" is
  'When a roster import last confirmed the durable identity columns. Unlike "involvementImportedAt" this is not reset when a member is absent from an import.';

comment on column "platform"."profile"."roleDescription" is
  'The officer bio shown on the homepage Leadership section. Editable by the holder from /account, but only surfaced there for members whose roles include one with "isLeadership". Distinct from "bio", which is the 127-character blurb on the member''s own profile.';

comment on column "platform"."profile"."majors" is
  'Degree programs, as printed. Read-only in the UI for now -- seeded from officer submissions, with no member-facing write path.';
