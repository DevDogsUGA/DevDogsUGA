-- Reshape reports and feedback for the shared instance.
--
-- What this removes, and why none of it is load-bearing:
--
--   * The `unverified` status, `verifyAttempts` and `nextVerifyAt` existed so
--     DevDogs could ask another app's backend "does this content exist?" over a
--     webhook. On one instance that question is a join, answered synchronously.
--   * `webhookAttempts` / `nextRetryAt` / `notifiedAt` on resolutions, and
--     `reportWebhookUrl` / `reportWebhookSecretId` on registrations, existed to
--     deliver the outcome back over HTTP. The app reads the row instead.
--   * `moderatorRoles` keyed moderation to an OAuth client. Moderation is
--     centralised in the platform now, so `roles."canModerate"` is the whole
--     model.
--   * `reportContentTypes` was a per-client list of labels with no semantics.
--     Content types become a property of the app's own schema.
--
-- On rebuilding rather than altering the report tables: nothing in the codebase
-- has ever inserted into "contentReports". The only writers were the verify
-- sweep and the resolve/dismiss actions, which update and delete; the sole
-- INSERT path was `POST /api/reports`, which was never implemented (its route
-- directory is empty). "reportResolutions" and "reportCorroborations" hang off
-- reports and are therefore empty too. So the cluster carries no data, and a
-- clean rebuild is both safe and far more readable than a column-by-column
-- migration of a shape we are largely discarding.
--
-- Feedback is different: "siteFeedback" holds real submissions from the site's
-- own dialog, so it is migrated in place.

-- ============================================================
-- 1. Drop the webhook delivery machinery
-- ============================================================

alter table "platform"."oauthRegistrations"
  drop column if exists "reportWebhookUrl",
  drop column if exists "reportWebhookSecretId";

-- The signing secrets those columns pointed at are now unreachable. Vault is
-- not in the generated types and has no FK to us, so orphans would simply
-- accumulate; named by the convention used when they were created.
delete from "vault"."secrets" where "name" like 'webhook_secret_%';

-- ============================================================
-- 2. Rebuild the report cluster
-- ============================================================

drop table if exists "platform"."reportCorroborations";
drop table if exists "platform"."reportResolutions";
drop table if exists "platform"."contentReports";
drop table if exists "platform"."reportContentTypes";
drop table if exists "platform"."moderatorRoles";

-- 'pending' becomes 'open', and 'unverified' disappears: a report is real the
-- moment it is filed, because filing resolves the content.
drop type if exists "platform"."reportStatus";
create type "platform"."reportStatus" as enum ('open', 'resolved', 'dismissed');

-- ------------------------------------------------------------
-- Reasons: per app rather than per OAuth client
-- ------------------------------------------------------------

-- Every existing row is keyed by an OAuth client id, and an OAuth client is no
-- longer what identifies an app -- there is no mapping to preserve. These rows
-- are developer configuration for a reporting pipeline that never processed a
-- single report, so they are discarded rather than guessed at.
delete from "platform"."reportReasons";

alter table "platform"."reportReasons"
  drop constraint if exists "reportReasons_clientId_oauth_clients_id_fkey";

drop index if exists "platform"."reportReasons_client_title_idx";
drop index if exists "platform"."reportReasons_client_id_idx";

alter table "platform"."reportReasons" rename column "clientId" to "appId";

alter table "platform"."reportReasons"
  add constraint "reportReasons_appId_fkey"
  foreign key ("appId") references "platform"."apps"("id") on delete cascade;

create unique index "reportReasons_app_title_idx"
  on "platform"."reportReasons" using btree ("appId", "title");
-- Supports the composite foreign key from reports, which is what stops a report
-- naming a reason that belongs to a different app.
create unique index "reportReasons_app_id_idx"
  on "platform"."reportReasons" using btree ("appId", "id");

-- ------------------------------------------------------------
-- Reports
-- ------------------------------------------------------------

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
  "reasonId"        uuid not null,
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
    foreign key ("reportedUserId") references auth.users("id") on delete cascade,
  add constraint "reports_appId_reasonId_fkey"
    foreign key ("appId", "reasonId")
    references "platform"."reportReasons"("appId", "id") on delete restrict;

-- One open report per piece of content: a second reporter corroborates the
-- existing one instead of queueing a duplicate. Partial, so the same content
-- can be reported again after a decision has been made.
create unique index "reports_open_content_idx"
  on "platform"."reports" using btree ("appId", "contentType", "contentRef")
  where ("status" = 'open');

create index "reports_status_idx" on "platform"."reports" using btree ("status");

-- Reporters see their own reports; moderators see everything. Writes go through
-- the RPCs added in the next migration, never directly.
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

-- ------------------------------------------------------------
-- Corroborations
-- ------------------------------------------------------------

create table "platform"."reportCorroborations" (
  "id"             uuid not null default gen_random_uuid(),
  "reportId"       uuid not null,
  "reporterUserId" uuid not null,
  "reasonId"       uuid not null,
  "description"    character varying(1000),
  "createdAt"      timestamp without time zone not null default now(),
  constraint "reportCorroborations_pkey" primary key ("id")
);

alter table "platform"."reportCorroborations" enable row level security;

alter table "platform"."reportCorroborations"
  add constraint "reportCorroborations_reportId_fkey"
    foreign key ("reportId") references "platform"."reports"("id") on delete cascade,
  add constraint "reportCorroborations_reporterUserId_fkey"
    foreign key ("reporterUserId") references auth.users("id") on delete cascade,
  add constraint "reportCorroborations_reasonId_fkey"
    foreign key ("reasonId") references "platform"."reportReasons"("id") on delete restrict;

create unique index "reportCorroborations_report_reporter_idx"
  on "platform"."reportCorroborations" using btree ("reportId", "reporterUserId");

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

-- ------------------------------------------------------------
-- Resolutions
-- ------------------------------------------------------------

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

alter table "platform"."reportResolutions"
  add constraint "reportResolutions_reportId_fkey"
    foreign key ("reportId") references "platform"."reports"("id") on delete cascade,
  add constraint "reportResolutions_moderatorUserId_fkey"
    foreign key ("moderatorUserId") references auth.users("id") on delete restrict;

-- The reporter learns the outcome of their own report; moderators see all.
-- "moderatorNote" is internal, and is filtered by the read RPC rather than
-- here, because column-level exclusion is not expressible in a policy.
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

-- ============================================================
-- 3. Feedback: per app, one code path
-- ============================================================

-- Same reasoning as reportReasons: topics were keyed by OAuth client, and there
-- is no mapping to an app. The site's own dialog uses a hardcoded list
-- (DEVDOGS_WEBSITE_FEEDBACK_TOPICS), not this table, so nothing user-facing
-- depends on these rows.
alter table "platform"."siteFeedback"
  drop constraint if exists "siteFeedback_clientId_topicId_fkey";

delete from "platform"."feedbackTopics";

alter table "platform"."feedbackTopics"
  drop constraint if exists "feedbackTopics_clientId_oauth_clients_id_fkey";

drop index if exists "platform"."feedbackTopics_client_label_idx";
drop index if exists "platform"."feedbackTopics_client_id_idx";

alter table "platform"."feedbackTopics" rename column "clientId" to "appId";

alter table "platform"."feedbackTopics"
  add constraint "feedbackTopics_appId_fkey"
  foreign key ("appId") references "platform"."apps"("id") on delete cascade;

create unique index "feedbackTopics_app_label_idx"
  on "platform"."feedbackTopics" using btree ("appId", "label");
create unique index "feedbackTopics_app_id_idx"
  on "platform"."feedbackTopics" using btree ("appId", "id");

-- Existing submissions all came from the site's own dialog, which never set
-- clientId or topicId -- the feedback API that would have was never
-- implemented. So every row belongs to the platform app, and the "clientId is
-- null XOR topicId is null" check that distinguished the two sources is no
-- longer meaningful: first-party feedback is simply feedback with
-- appId = 'platform'.
alter table "platform"."siteFeedback" rename to "feedback";

alter table "platform"."feedback"
  drop constraint if exists "siteFeedback_topic_xor_clientId";

alter table "platform"."feedback" add column "appId" uuid;

update "platform"."feedback"
  set "appId" = (select "id" from "platform"."apps" where "slug" = 'platform'),
      "topicId" = null;

alter table "platform"."feedback"
  drop column if exists "clientId",
  alter column "appId" set not null;

alter table "platform"."feedback"
  add constraint "feedback_appId_fkey"
    foreign key ("appId") references "platform"."apps"("id") on delete cascade,
  add constraint "feedback_appId_topicId_fkey"
    foreign key ("appId", "topicId")
    references "platform"."feedbackTopics"("appId", "id") on delete restrict;
