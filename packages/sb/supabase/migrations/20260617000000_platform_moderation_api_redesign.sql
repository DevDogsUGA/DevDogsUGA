-- ============================================================
-- Step 1a: New reportReasons table
-- ============================================================

create table "platform"."reportReasons" (
  "id"          uuid                        not null default gen_random_uuid(),
  "clientId"    uuid                        not null,
  "title"       character varying(100)      not null,
  "description" text,
  "createdAt"   timestamp without time zone not null default now()
);

alter table "platform"."reportReasons" enable row level security;

CREATE UNIQUE INDEX "reportReasons_pkey"           ON platform."reportReasons" USING btree (id);
CREATE UNIQUE INDEX "reportReasons_client_title_idx" ON platform."reportReasons" USING btree ("clientId", title);
CREATE UNIQUE INDEX "reportReasons_client_id_idx"   ON platform."reportReasons" USING btree ("clientId", id);

alter table "platform"."reportReasons" add constraint "reportReasons_pkey" PRIMARY KEY using index "reportReasons_pkey";

alter table "platform"."reportReasons" add constraint "reportReasons_clientId_oauth_clients_id_fkey"
  FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;
alter table "platform"."reportReasons" validate constraint "reportReasons_clientId_oauth_clients_id_fkey";

-- Owner: the developer who registered the OAuth client
create policy "owner_insert"
  on "platform"."reportReasons"
  as permissive for insert to authenticated
  with check (auth.uid() = (SELECT "userId" FROM "platform"."oauthRegistrations" WHERE "clientId" = "reportReasons"."clientId"));

create policy "owner_delete"
  on "platform"."reportReasons"
  as permissive for delete to authenticated
  using (auth.uid() = (SELECT "userId" FROM "platform"."oauthRegistrations" WHERE "clientId" = "reportReasons"."clientId"));

-- Any authenticated user can read reasons (needed before submitting a report)
create policy "authenticated_select"
  on "platform"."reportReasons"
  as permissive for select to authenticated
  using (true);


-- ============================================================
-- Step 1a: New reportContentTypes table
-- ============================================================

create table "platform"."reportContentTypes" (
  "id"        uuid                        not null default gen_random_uuid(),
  "clientId"  uuid                        not null,
  "label"     character varying(100)      not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "platform"."reportContentTypes" enable row level security;

CREATE UNIQUE INDEX "reportContentTypes_pkey"           ON platform."reportContentTypes" USING btree (id);
CREATE UNIQUE INDEX "reportContentTypes_client_label_idx" ON platform."reportContentTypes" USING btree ("clientId", label);
CREATE UNIQUE INDEX "reportContentTypes_client_id_idx"   ON platform."reportContentTypes" USING btree ("clientId", id);

alter table "platform"."reportContentTypes" add constraint "reportContentTypes_pkey" PRIMARY KEY using index "reportContentTypes_pkey";

alter table "platform"."reportContentTypes" add constraint "reportContentTypes_clientId_oauth_clients_id_fkey"
  FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;
alter table "platform"."reportContentTypes" validate constraint "reportContentTypes_clientId_oauth_clients_id_fkey";

create policy "owner_insert"
  on "platform"."reportContentTypes"
  as permissive for insert to authenticated
  with check (auth.uid() = (SELECT "userId" FROM "platform"."oauthRegistrations" WHERE "clientId" = "reportContentTypes"."clientId"));

create policy "owner_delete"
  on "platform"."reportContentTypes"
  as permissive for delete to authenticated
  using (auth.uid() = (SELECT "userId" FROM "platform"."oauthRegistrations" WHERE "clientId" = "reportContentTypes"."clientId"));

create policy "authenticated_select"
  on "platform"."reportContentTypes"
  as permissive for select to authenticated
  using (true);


-- ============================================================
-- Step 1b: Replace reason + contentType on contentReports
-- ============================================================

alter table "platform"."contentReports"
  drop column "reason",
  add column "reasonId"      uuid not null,
  add column "contentTypeId" uuid;

alter table "platform"."contentReports"
  add constraint "contentReports_clientId_reasonId_fkey"
    FOREIGN KEY ("clientId", "reasonId") REFERENCES "platform"."reportReasons"("clientId", "id") ON DELETE RESTRICT not valid;
alter table "platform"."contentReports" validate constraint "contentReports_clientId_reasonId_fkey";

alter table "platform"."contentReports"
  add constraint "contentReports_clientId_contentTypeId_fkey"
    FOREIGN KEY ("clientId", "contentTypeId") REFERENCES "platform"."reportContentTypes"("clientId", "id") ON DELETE RESTRICT not valid;
alter table "platform"."contentReports" validate constraint "contentReports_clientId_contentTypeId_fkey";

-- One active report per content item per client (enables SDK dedup / corroboration)
CREATE UNIQUE INDEX "contentReports_client_content_idx"
  ON "platform"."contentReports" ("clientId", "contentId");

-- contentType varchar column is now replaced by contentTypeId FK
alter table "platform"."contentReports" drop column "contentType";


-- ============================================================
-- Step 1b: Replace reason on reportCorroborations
-- ============================================================

alter table "platform"."reportCorroborations"
  drop column "reason",
  add column "reasonId" uuid not null;

alter table "platform"."reportCorroborations"
  add constraint "reportCorroborations_reasonId_fkey"
    FOREIGN KEY ("reasonId") REFERENCES "platform"."reportReasons"("id") ON DELETE RESTRICT not valid;
alter table "platform"."reportCorroborations" validate constraint "reportCorroborations_reasonId_fkey";


-- ============================================================
-- Step 1b: Drop reportReason enum (no longer referenced)
-- ============================================================

drop type "platform"."reportReason";


-- ============================================================
-- Step 1c: Add 'unverified' to reportStatus enum
-- ============================================================

alter type "platform"."reportStatus" add value 'unverified' before 'pending';


-- Step 1c: contentReports.status default is updated in the next migration file
-- (ALTER TYPE ADD VALUE commits implicitly; the new value can't be used in the same transaction)


-- ============================================================
-- Step 1d: Verification tracking columns on contentReports
-- ============================================================

alter table "platform"."contentReports"
  add column "verifyAttempts" integer not null default 0,
  add column "nextVerifyAt"   timestamp without time zone;


-- ============================================================
-- Step 1e: Remove reportApiKeyHash from oauthRegistrations
-- ============================================================

alter table "platform"."oauthRegistrations" drop column "reportApiKeyHash";


-- ============================================================
-- Step 1f: RLS on contentReports — allow reporters to INSERT
-- ============================================================

-- Replace existing restrictive INSERT block with a permissive reporter check
drop policy "crud_authenticated_policy_insert" on "platform"."contentReports";

create policy "reporter_insert"
  on "platform"."contentReports"
  as permissive for insert to authenticated
  with check ((SELECT auth.uid()) = "reporterUserId");

-- Also allow reporters to SELECT their own reports (existing policy already covers this,
-- but the existing check also allows moderators — keep that intact)


-- ============================================================
-- Step 1g: RLS on reportCorroborations — allow corroborators to INSERT + SELECT own
-- ============================================================

drop policy "crud_authenticated_policy_insert" on "platform"."reportCorroborations";
drop policy "crud_authenticated_policy_select" on "platform"."reportCorroborations";

create policy "corroborator_insert"
  on "platform"."reportCorroborations"
  as permissive for insert to authenticated
  with check ((SELECT auth.uid()) = "reporterUserId");

create policy "corroborator_select"
  on "platform"."reportCorroborations"
  as permissive for select to authenticated
  using (
    -- Corroborators can read their own submissions
    (SELECT auth.uid()) = "reporterUserId"
    OR
    -- Moderators can read all corroborations for their client
    EXISTS (
      SELECT 1 FROM platform."contentReports" cr
      JOIN platform."moderatorRoles" mr ON mr."clientId" = cr."clientId"
      WHERE cr.id = "reportCorroborations"."reportId"
        AND mr."userId" = (SELECT auth.uid())
    )
  );


-- ============================================================
-- Step 1h: Feedback schema changes
-- ============================================================

-- Add UNIQUE (clientId, id) to feedbackTopics for composite FK support
CREATE UNIQUE INDEX "feedbackTopics_client_id_idx" ON platform."feedbackTopics" USING btree ("clientId", id);

-- Replace topic varchar with topicId FK on siteFeedback
alter table "platform"."siteFeedback"
  drop column "topic",
  add column "topicId" uuid;

alter table "platform"."siteFeedback"
  add constraint "siteFeedback_clientId_topicId_fkey"
    FOREIGN KEY ("clientId", "topicId") REFERENCES "platform"."feedbackTopics"("clientId", "id") ON DELETE RESTRICT not valid;
alter table "platform"."siteFeedback" validate constraint "siteFeedback_clientId_topicId_fkey";

-- Enforce: first-party submissions (no clientId) also have no topicId, and vice versa
alter table "platform"."siteFeedback"
  add constraint "siteFeedback_topic_xor_clientId"
    CHECK (("clientId" IS NULL) = ("topicId" IS NULL));

-- Allow authenticated users to SELECT from feedbackTopics (previously blocked)
-- so the SDK can call getTopics() via PostgREST
drop policy "crud_public_policy_select" on "platform"."feedbackTopics";

create policy "authenticated_select"
  on "platform"."feedbackTopics"
  as permissive for select to authenticated
  using (true);

-- Allow feedbackTopics owners to INSERT and DELETE via PostgREST
drop policy "crud_public_policy_insert" on "platform"."feedbackTopics";
drop policy "crud_public_policy_delete" on "platform"."feedbackTopics";

create policy "owner_insert"
  on "platform"."feedbackTopics"
  as permissive for insert to authenticated
  with check (auth.uid() = (SELECT "userId" FROM "platform"."oauthRegistrations" WHERE "clientId" = "feedbackTopics"."clientId"));

create policy "owner_delete"
  on "platform"."feedbackTopics"
  as permissive for delete to authenticated
  using (auth.uid() = (SELECT "userId" FROM "platform"."oauthRegistrations" WHERE "clientId" = "feedbackTopics"."clientId"));
