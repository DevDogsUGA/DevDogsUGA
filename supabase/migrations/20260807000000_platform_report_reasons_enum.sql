-- Report reasons: one global vocabulary, owned by the platform.
--
-- What this replaces: a table of (id uuid, appId uuid, title, description) rows
-- that each app configured for itself through a dashboard page. Three things
-- were wrong with that, and they compound:
--
--   * The rows were per-app but never actually differed. seed/02_moderation.sql
--     cross-joined EVERY registered app with the SAME eight reasons, so the
--     table stored N copies of one editorial list.
--   * Seeds do not run on production, so production's reasons existed only
--     because somebody typed them into /tools/moderation. A fresh production
--     instance could accept no reports at all.
--   * A uuid on the wire means a client must fetch the list before it can file,
--     cannot hardcode a reason in a test or a fixture, and cannot group reports
--     by reason across apps without joining to an editable title.
--
-- The vocabulary is now an enum, and the enum is the identity. `supabase gen
-- types` emits every platform enum as a TypeScript literal union *and* a
-- runtime array in its Constants export, so a typo fails to compile with no
-- codegen of our own -- which is the whole reason this is a type rather than a
-- table of slugs.
--
-- Wording and ordering live in the companion table below, so re-wording a
-- reason is a row update that applies retroactively to every report already
-- filed, and retiring one is a row delete. The enum label lingers harmlessly in
-- the type, and historical reports keep parsing.
--
-- Scoping was considered and rejected: no per-app lists, no per-content-type
-- lists. One code of conduct applies across DevDogs, and 'other' -- which
-- requires a description, enforced in file_report -- absorbs what it misses.
--
-- ADDING A REASON LATER TAKES TWO MIGRATIONS. `alter type ... add value` cannot
-- be used in the transaction that adds it, so the label lands in one file and
-- its presentation row in the next. Creating the type with all its labels at
-- once, as below, is fine. A CI assertion in packages/supabase/testing compares
-- enum_range() against this table so a forgotten second file fails the build
-- rather than shipping a reason that file_report accepts and
-- list_report_reasons never returns.

-- ============================================================
-- 1. The vocabulary
-- ============================================================

create type "platform"."reportReason" as enum (
  'harassment',
  'hate_speech',
  'spam',
  'sexual_content',
  'violence',
  'impersonation',
  'off_topic',
  'other'
);

-- ============================================================
-- 2. Reports carry the label
-- ============================================================
--
-- Added nullable, backfilled, then constrained -- the usual three-step, even
-- though every instance is expected to have zero rows here. `reports` was
-- created empty by 20260730000001 and nothing has filed against it in
-- production.

alter table "platform"."reports"
  add column "reason" "platform"."reportReason";

alter table "platform"."reportCorroborations"
  add column "reason" "platform"."reportReason";

-- Titles are mapped explicitly rather than derived. lower(replace(' ', '_'))
-- would produce 'off-topic' from 'Off-topic' and 'something_else' from
-- 'Something else', neither of which is a label. Anything unrecognised becomes
-- 'other', so this cannot fail and cannot lose a report.
create or replace function pg_temp.reason_label(title text)
returns "platform"."reportReason"
language sql
immutable
as $$
  select case lower(coalesce(title, ''))
    when 'harassment'     then 'harassment'
    when 'hate speech'    then 'hate_speech'
    when 'spam'           then 'spam'
    when 'sexual content' then 'sexual_content'
    when 'violence'       then 'violence'
    when 'impersonation'  then 'impersonation'
    when 'off-topic'      then 'off_topic'
    else 'other'
  end::"platform"."reportReason";
$$;

update "platform"."reports" r
set "reason" = pg_temp.reason_label(rr."title")
from "platform"."reportReasons" rr
where rr."id" = r."reasonId";

update "platform"."reportCorroborations" c
set "reason" = pg_temp.reason_label(rr."title")
from "platform"."reportReasons" rr
where rr."id" = c."reasonId";

-- A row whose reason did not resolve at all (its reason was deleted out from
-- under it, which the old `on delete restrict` should have prevented) still has
-- to end up somewhere honest.
update "platform"."reports" set "reason" = 'other' where "reason" is null;
update "platform"."reportCorroborations" set "reason" = 'other' where "reason" is null;

alter table "platform"."reports"
  drop constraint if exists "reports_appId_reasonId_fkey";
alter table "platform"."reportCorroborations"
  drop constraint if exists "reportCorroborations_reasonId_fkey";

alter table "platform"."reports"             drop column "reasonId";
alter table "platform"."reportCorroborations" drop column "reasonId";

alter table "platform"."reports"             alter column "reason" set not null;
alter table "platform"."reportCorroborations" alter column "reason" set not null;

-- ============================================================
-- 3. Presentation
-- ============================================================

drop table "platform"."reportReasons";

-- The primary key IS the enum type, so a row cannot exist without a label.
-- Only the other direction can break -- a label with no row -- and that state
-- is silent rather than loud: file_report would accept the label, while
-- list_report_reasons omitted it and the generated TypeScript union still
-- contained it. Hence the CI assertion referred to at the top of this file.
create table "platform"."reportReasons" (
  "reason"      "platform"."reportReason" not null,
  "title"       character varying(100) not null,
  "description" text,
  -- Display order. Sorting by title would put 'Something else' in the middle of
  -- the list instead of at the end, which is where a catch-all belongs.
  "position"    integer not null,
  constraint "reportReasons_pkey" primary key ("reason")
);

alter table "platform"."reportReasons" enable row level security;

create unique index "reportReasons_position_idx"
  on "platform"."reportReasons" using btree ("position");

insert into "platform"."reportReasons" ("reason", "title", "description", "position") values
  ('harassment',     'Harassment',     'Targeted abuse, bullying, or unwanted contact.',        1),
  ('hate_speech',    'Hate speech',    'Attacks a person or group on the basis of who they are.', 2),
  ('violence',       'Violence',       'Threats of violence, or content glorifying it.',       3),
  ('sexual_content', 'Sexual content', 'Sexually explicit material.',                          4),
  ('impersonation',  'Impersonation',  'Pretending to be another person or organisation.',     5),
  ('spam',           'Spam',           'Unsolicited advertising, scams, or repetitive posting.', 6),
  ('off_topic',      'Off-topic',      'Not relevant to this space.',                          7),
  ('other',          'Something else', 'Anything not covered above — please describe it.',     8);

-- Readable by any signed-in user: a client has to know what it may report
-- before it can offer the affordance. Identical policy set to
-- platform."contentTypes" (20260730000002), for the same reasons -- including
-- the split per command, because a restrictive `for all ... using (false)`
-- would also apply to SELECT and silently override the read policy.
create policy "authenticated_select"
  on "platform"."reportReasons"
  as permissive for select to authenticated
  using (true);

create policy "no_client_insert"
  on "platform"."reportReasons"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."reportReasons"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."reportReasons"
  as restrictive for delete to anon, authenticated
  using (false);

-- Org-wide configuration granting unconditional `authenticated` SELECT, which
-- is exactly the category 20260729000000 denies to test identities.
create policy "deny_test_identities"
  on "platform"."reportReasons"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));

-- The moderator_insert/update/delete policies that 20260730000002 added to the
-- old table are deliberately not recreated. Nothing writes this at runtime any
-- more; the rows come from migrations, and /tools/moderation is being deleted.

-- ============================================================
-- 4. Fix the corroboration conflict target
-- ============================================================
--
-- Pre-existing bug, on a path the next migration rewrites anyway.
--
-- file_report swallows a repeat corroboration with
-- `on conflict on constraint "reportCorroborations_pkey" do nothing`. That
-- primary key is on "id", which defaults to gen_random_uuid(), so it never
-- conflicts -- while the thing that actually conflicts, a second corroboration
-- by the same reporter on the same report, is caught by
-- "reportCorroborations_report_reporter_idx" and raised as an unhandled
-- unique_violation. A user who reported the same content twice got an error
-- instead of a silent no-op.
--
-- The pkey was chosen because `on conflict ("reportId", "reporterUserId")` is
-- ambiguous under a `returns table` signature -- "reportId" is also an OUT
-- parameter, and a parenthesised conflict target resolves against both
-- namespaces. That reasoning was sound; the fix is to give the pair a real
-- CONSTRAINT so it can be named, since `on conflict on constraint` cannot refer
-- to a bare unique index.
drop index if exists "platform"."reportCorroborations_report_reporter_idx";

alter table "platform"."reportCorroborations"
  add constraint "reportCorroborations_report_reporter_key"
    unique ("reportId", "reporterUserId");
