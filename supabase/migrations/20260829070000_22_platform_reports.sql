-- Reports: the vocabulary, the queue, and the decision.
--
-- Creates five enums and four tables. platform."reportReasons" is the editorial
-- list a client shows in the report dialog; platform."reports" is one open
-- report per piece of content; platform."reportCorroborations" is every
-- additional reporter who hit the same content while that report was open; and
-- platform."reportResolutions" is the moderator's single decision on it.
--
-- The one thing to know before editing: the reason a report carries is the ENUM
-- LABEL, not a foreign key. platform."reportReason" is the identity, and
-- "reportReasons" only supplies wording and display order, so re-wording a
-- reason is a row update that applies retroactively to every report already
-- filed. `supabase gen types` emits the enum as a TypeScript union and a runtime
-- array, which is why the vocabulary is a type rather than a table of slugs. A
-- CI assertion in packages/supabase/testing compares enum_range() against the
-- eight seed rows, so a label with no row fails the build instead of shipping a
-- reason that file_report accepts and list_report_reasons never returns.
--
-- Adding a reason later takes two migrations: `alter type ... add value` cannot
-- be followed by a use of the new value in the same transaction, so the label
-- lands in one file and its presentation row in the next. Creating the type with
-- all its labels at once, as below, is fine.
--
-- Nothing here is client-writable. Every write goes through the moderation RPCs
-- two files later. This file must run after the app registry (reports FK apps),
-- after the permission helpers (the select policies call has_permission and
-- deny_test_identities calls is_test_identity, and policy predicates are parsed
-- at CREATE POLICY time), and before the content-type registry, whose
-- content_types() body contains a '"platform"."reportResolutions"'::regclass
-- literal that resolves at CREATE FUNCTION time.

-- ============================================================
-- 1. The vocabulary
-- ============================================================

-- What a moderator may do about the reported content, the person who filed, and
-- the person who was reported. Written here because reportResolutions is their
-- only table; apply_content_action() in the dispatch file also reads
-- "contentAction".
create type "platform"."contentAction" as enum ('quarantine', 'no_action');

create type "platform"."filerAction" as enum ('warn', 'suspend', 'no_action');

create type "platform"."subjectAction" as enum ('warn', 'suspend', 'ban', 'no_action');

-- A report is real the moment it is filed, because filing resolves the content
-- against the app's own schema. There is no 'unverified' state and no pending
-- webhook round trip to another backend.
create type "platform"."reportStatus" as enum ('open', 'resolved', 'dismissed');

-- One code of conduct applies across DevDogs, so there are no per-app and no
-- per-content-type lists. 'other' absorbs what the seven miss, and file_report
-- requires a description with it.
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
-- 2. Presentation for the vocabulary
-- ============================================================

-- The primary key IS the enum type, so a row cannot exist without a label. Only
-- the other direction can break, a label with no row, and that state is silent
-- rather than loud: file_report would accept the label while
-- list_report_reasons omitted it and the generated TypeScript union still
-- contained it. Hence the CI assertion named at the top of this file.
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

-- Readable by any signed-in user: a client has to know what it may report before
-- it can offer the affordance. Identical policy set to platform."contentTypes",
-- for the same reasons, including the split per command. A restrictive
-- `for all ... using (false)` would also apply to SELECT and silently override
-- the read policy above it.
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

-- Org-wide configuration granting unconditional `authenticated` SELECT, which is
-- exactly the category the permission-helpers file denies to test identities.
create policy "deny_test_identities"
  on "platform"."reportReasons"
  as restrictive for all to authenticated
  using (not "platform".is_test_identity((select auth.uid())))
  with check (not "platform".is_test_identity((select auth.uid())));

-- Nothing writes this table at runtime. The rows come from this migration, so
-- there are deliberately no moderator insert/update/delete policies.

-- ============================================================
-- 3. Reports
-- ============================================================

create table "platform"."reports" (
  "id"              uuid not null default gen_random_uuid(),
  "appId"           uuid not null,
  "reporterUserId"  uuid not null,
  "reportedUserId"  uuid not null,
  -- Identifies a row in the app's own schema. Validated against the app's
  -- detected content types when the report is filed.
  "contentType"     text not null,
  "contentRef"      text not null,
  -- Frozen at filing time so a moderator reviews what was actually reported,
  -- even if the content later changes or is deleted.
  "contentSnapshot" character varying(5000) not null,
  "contentUrl"      text,
  "description"     character varying(1000),
  -- The label, not a key. See the header.
  "reason"          "platform"."reportReason" not null,
  "status"          "platform"."reportStatus" not null default 'open',
  "createdAt"       timestamp without time zone not null default now(),
  "resolvedAt"      timestamp without time zone,
  constraint "reports_pkey" primary key ("id")
);

alter table "platform"."reports" enable row level security;

alter table "platform"."reports"
  add constraint "reports_appId_fkey"
    foreign key ("appId") references "platform"."apps"("id") on delete cascade,
  add constraint "reports_reporterUserId_fkey"
    foreign key ("reporterUserId") references auth.users("id") on delete cascade,
  add constraint "reports_reportedUserId_fkey"
    foreign key ("reportedUserId") references auth.users("id") on delete cascade;

-- One open report per piece of content: a second reporter corroborates the
-- existing one instead of queueing a duplicate. Partial, so the same content can
-- be reported again after a decision has been made.
create unique index "reports_open_content_idx"
  on "platform"."reports" using btree ("appId", "contentType", "contentRef")
  where ("status" = 'open');

create index "reports_status_idx" on "platform"."reports" using btree ("status");

-- Reporters see their own reports; moderators see everything. Writes go through
-- the moderation RPCs, never directly.
create policy "reporter_or_moderator_select"
  on "platform"."reports"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "reporterUserId"
    or "platform".has_permission((select auth.uid()), 'canModerate')
  );

create policy "no_client_insert"
  on "platform"."reports"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."reports"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."reports"
  as restrictive for delete to anon, authenticated
  using (false);

-- ============================================================
-- 4. Corroborations
-- ============================================================

create table "platform"."reportCorroborations" (
  "id"             uuid not null default gen_random_uuid(),
  "reportId"       uuid not null,
  "reporterUserId" uuid not null,
  "reason"         "platform"."reportReason" not null,
  "description"    character varying(1000),
  "createdAt"      timestamp without time zone not null default now(),
  constraint "reportCorroborations_pkey" primary key ("id")
);

alter table "platform"."reportCorroborations" enable row level security;

alter table "platform"."reportCorroborations"
  add constraint "reportCorroborations_reportId_fkey"
    foreign key ("reportId") references "platform"."reports"("id") on delete cascade,
  add constraint "reportCorroborations_reporterUserId_fkey"
    foreign key ("reporterUserId") references auth.users("id") on delete cascade;

-- A real CONSTRAINT, not a bare unique index, and that distinction is
-- load-bearing. file_report swallows a repeat corroboration with
-- `on conflict on constraint "reportCorroborations_report_reporter_key"`, and
-- `on conflict on constraint` cannot name an index. The parenthesised form
-- `on conflict ("reportId", "reporterUserId")` is not an option either: under
-- file_report's `returns table` signature, "reportId" is also an OUT parameter
-- and the target resolves against both namespaces. Turn this back into an index
-- and a user reporting the same content twice gets an unhandled unique_violation
-- instead of a silent no-op.
alter table "platform"."reportCorroborations"
  add constraint "reportCorroborations_report_reporter_key"
    unique ("reportId", "reporterUserId");

create policy "corroborator_or_moderator_select"
  on "platform"."reportCorroborations"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "reporterUserId"
    or "platform".has_permission((select auth.uid()), 'canModerate')
  );

create policy "no_client_insert"
  on "platform"."reportCorroborations"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."reportCorroborations"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."reportCorroborations"
  as restrictive for delete to anon, authenticated
  using (false);

-- ============================================================
-- 5. Resolutions
-- ============================================================
--
-- One decision per report, enforced by reportResolutions_reportId_key. There are
-- no webhookAttempts, nextRetryAt or notifiedAt columns: the outcome is a row
-- the app reads, not an HTTP delivery it retries.

create table "platform"."reportResolutions" (
  "id"              uuid not null default gen_random_uuid(),
  "reportId"        uuid not null,
  "moderatorUserId" uuid not null,
  "subjectAction"   "platform"."subjectAction" not null,
  "filerAction"     "platform"."filerAction" not null,
  "contentAction"   "platform"."contentAction" not null,
  "appliedGlobally" boolean not null default false,
  "moderatorNote"   text,
  "createdAt"       timestamp without time zone not null default now(),
  constraint "reportResolutions_pkey" primary key ("id"),
  constraint "reportResolutions_reportId_key" unique ("reportId")
);

alter table "platform"."reportResolutions" enable row level security;

-- moderatorUserId is RESTRICT, not cascade: deleting an account must not erase
-- the record of a decision that account made. The reportId side is cascade
-- because a resolution is meaningless without its report.
--
-- This table is also the anchor of the quarantine model. A content table
-- declares itself quarantinable by carrying a foreign key to this table, which
-- is how content_types() detects the capability, and platform.profile's
-- "quarantinedBy" is one such column.
alter table "platform"."reportResolutions"
  add constraint "reportResolutions_reportId_fkey"
    foreign key ("reportId") references "platform"."reports"("id") on delete cascade,
  add constraint "reportResolutions_moderatorUserId_fkey"
    foreign key ("moderatorUserId") references auth.users("id") on delete restrict;

-- The reporter learns the outcome of their own report; moderators see all.
-- "moderatorNote" is internal, and is filtered by the read RPC rather than here,
-- because column-level exclusion is not expressible in a policy.
create policy "reporter_or_moderator_select"
  on "platform"."reportResolutions"
  as permissive for select to authenticated
  using (
    exists (
      select 1 from "platform"."reports" r
      where r."id" = "reportResolutions"."reportId"
        and (
          r."reporterUserId" = (select auth.uid())
          or "platform".has_permission((select auth.uid()), 'canModerate')
        )
    )
  );

create policy "no_client_insert"
  on "platform"."reportResolutions"
  as restrictive for insert to anon, authenticated
  with check (false);

create policy "no_client_update"
  on "platform"."reportResolutions"
  as restrictive for update to anon, authenticated
  using (false) with check (false);

create policy "no_client_delete"
  on "platform"."reportResolutions"
  as restrictive for delete to anon, authenticated
  using (false);
