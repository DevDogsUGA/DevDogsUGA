-- ============================================================
-- The executive board, as data
-- ============================================================
--
-- The Leadership section on the homepage read `execBoard` in
-- `apps/platform/src/app/(site)/homeData.ts` -- nine object literals, each
-- with a headshot imported from `~/assets`. That array was placeholder
-- content and had drifted into being wrong rather than merely stale: it
-- listed six people who are not on the board, omitted four who are, and
-- assigned titles the officers themselves contradict in writing. Every entry
-- carried the same devdogs@uga.edu and the same org-wide GitHub and LinkedIn
-- URL, which is how a placeholder tells you it is one.
--
-- The board turns over every spring. A yearly edit to a TypeScript array is a
-- deploy, a review and a rebuild to change a sentence about a person, and the
-- thing being described is not code.
--
-- ============================================================
-- Terms, not overwrites
-- ============================================================
--
-- `term` is on the row and part of its identity, so next spring's board is an
-- insert rather than an overwrite. The site filters to one term; the rows
-- that fall out of that filter are the club's record of who ran it, which is
-- the other half of why this data was collected. Deleting last year's board
-- to make room for this year's would throw that away every May.
--
-- `active` is the within-term switch -- somebody stepping down mid-year comes
-- off the page without their row leaving the term.
--
-- ============================================================
-- What is deliberately NOT here
-- ============================================================
--
-- Resumes, and legal names where they differ from the name the officer goes
-- by. Both came in on the same emails as everything below; neither belongs in
-- a table whose entire purpose is to be read by anonymous visitors. The
-- resumes carry phone numbers and home addresses and live in a private
-- archive outside this repo. Two officers submitted under a legal first name
-- and asked to be shown under another -- the name they gave is the only name
-- here, and the mapping stays in the archive.
--
-- The nullable columns are nullable because the answers do not exist yet, not
-- because they are optional in principle. Nobody stated pronouns; one officer
-- of seven gave a graduation year; nobody sent a GitHub or LinkedIn. A
-- not-null column with an invented default would make the page state things
-- no officer said. The card renders each of these only when present.

create table "platform"."officers" (
  "id" uuid not null default gen_random_uuid(),

  -- Academic year the board served, as printed: '2026-27'.
  "term" text not null,
  -- Stable per-person key within a term. Matches the filename stem used by the
  -- headshot in storage and by the officer's folder in the private archive, so
  -- a row, an image and a submission can be lined up by eye.
  "slug" text not null,

  -- The name to print. For two officers this is not their legal name; see the
  -- note above.
  "displayName" text not null,

  -- Arrays because officers hold more than one of each and the card prints
  -- them as a list. Empty is a real answer -- two officers stated no DevDogs
  -- title at all -- and is distinct from "we never asked".
  "titles" text[] not null default '{}',
  "majors" text[] not null default '{}',
  "minors" text[] not null default '{}',
  "certificates" text[] not null default '{}',

  "pronouns" text,
  -- Text, not an integer: officers write "2029" but also "Sophomore", and the
  -- card prints the string rather than computing with it.
  "gradYear" text,

  "bio" text not null,

  -- Bucket-relative key in the public `leadership` bucket, not a URL. The
  -- origin belongs to the deployment, not to the row -- staging and production
  -- serve the same key from different Supabase projects, and a stored absolute
  -- URL would pin every row to whichever one seeded it.
  "headshotPath" text,
  -- Not needed for layout: both cards draw the image with next/image's `fill`
  -- inside a fixed-size circle, so nothing reflows whatever these say. They
  -- are here as the record of what was actually uploaded -- enough to notice
  -- that one officer's submission was 199px on its longest side, which is the
  -- kind of thing that is invisible once the file is in a bucket -- and so a
  -- consumer that does not use `fill` has them without fetching the image.
  "headshotWidth" integer,
  "headshotHeight" integer,
  -- This one IS needed to render: a static import carried a blur placeholder
  -- with it and a runtime URL does not, so it is generated at seed time.
  "headshotBlurDataUrl" text,

  "portfolioUrl" text,
  "githubUrl" text,
  "linkedinUrl" text,
  -- A publishable address only. Three officers submitted from personal Gmail
  -- accounts; those are contact details for the club, not for the internet,
  -- and are not what this column is for.
  "email" text,

  -- Explicit, because the meaningful order is neither alphabetical nor
  -- chronological -- it is the shape of the board, President first.
  "sortOrder" integer not null default 0,
  "active" boolean not null default true,

  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),

  constraint "officers_pkey" primary key ("id"),
  -- One row per person per term. This is also the conflict target the seed
  -- upserts on, which is what makes re-running it safe.
  constraint "officers_term_slug_key" unique ("term", "slug"),

  constraint "officers_slug_format"
    check ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint "officers_term_format"
    check ("term" ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint "officers_bio_not_blank"
    check (length(btrim("bio")) > 0),
  constraint "officers_displayName_not_blank"
    check (length(btrim("displayName")) > 0),
  -- A headshot is its key and both dimensions, or it is not there yet. Half a
  -- headshot is the reflow this table set out to avoid.
  constraint "officers_headshot_dimensions_together"
    check (
      ("headshotPath" is null) = ("headshotWidth" is null)
      and ("headshotPath" is null) = ("headshotHeight" is null)
    ),
  constraint "officers_headshot_dimensions_positive"
    check (
      ("headshotWidth" is null or "headshotWidth" > 0)
      and ("headshotHeight" is null or "headshotHeight" > 0)
    )
);

comment on table "platform"."officers" is
  'One row per officer per term, for the public Leadership section. Public-safe fields only -- resumes and legal names stay in the private submission archive.';

-- The homepage query is `where "term" = $1 and "active" order by "sortOrder"`.
create index "officers_term_active_sortOrder_idx"
  on "platform"."officers" ("term", "active", "sortOrder");

alter table "platform"."officers" enable row level security;

-- ============================================================
-- RLS
-- ============================================================
--
-- Readable by everyone including logged-out visitors -- this is marketing copy
-- on the front page, and the whole table is content the officers wrote to be
-- published.
--
-- No column grants here, unlike "teams". That table needed them because it has
-- a column anonymous readers must not reach; this one does not, by
-- construction -- the fields that would have needed hiding were kept out of the
-- table entirely rather than granted around. If a private column is ever added
-- here, this comment is wrong and a column grant is the fix.
create policy "public_select" on "platform"."officers"
  as permissive for select to anon, authenticated using (true);

-- Officers are edited by the seed and by the console, both of which connect as
-- the owner. There is no client write path, so there is none to allow.
create policy "no_client_insert" on "platform"."officers"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."officers"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."officers"
  as restrictive for delete to anon, authenticated using (false);
