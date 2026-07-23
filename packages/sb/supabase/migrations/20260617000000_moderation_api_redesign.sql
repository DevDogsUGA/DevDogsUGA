-- ============================================================
-- Step 1a: New reportReasons table
-- ============================================================

create table "public"."reportReasons" (
  "id"          uuid                        not null default gen_random_uuid(),
  "clientId"    uuid                        not null,
  "title"       character varying(100)      not null,
  "description" text,
  "createdAt"   timestamp without time zone not null default now()
);

alter table "public"."reportReasons" enable row level security;

CREATE UNIQUE INDEX "reportReasons_pkey"           ON public."reportReasons" USING btree (id);
CREATE UNIQUE INDEX "reportReasons_client_title_idx" ON public."reportReasons" USING btree ("clientId", title);
CREATE UNIQUE INDEX "reportReasons_client_id_idx"   ON public."reportReasons" USING btree ("clientId", id);

alter table "public"."reportReasons" add constraint "reportReasons_pkey" PRIMARY KEY using index "reportReasons_pkey";

alter table "public"."reportReasons" add constraint "reportReasons_clientId_oauth_clients_id_fkey"
  FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;
alter table "public"."reportReasons" validate constraint "reportReasons_clientId_oauth_clients_id_fkey";

-- Owner: the developer who registered the OAuth client
create policy "owner_insert"
  on "public"."reportReasons"
  as permissive for insert to authenticated
  with check (auth.uid() = (SELECT "userId" FROM "oauthRegistrations" WHERE "clientId" = "reportReasons"."clientId"));

create policy "owner_delete"
  on "public"."reportReasons"
  as permissive for delete to authenticated
  using (auth.uid() = (SELECT "userId" FROM "oauthRegistrations" WHERE "clientId" = "reportReasons"."clientId"));

-- Any authenticated user can read reasons (needed before submitting a report)
create policy "authenticated_select"
  on "public"."reportReasons"
  as permissive for select to authenticated
  using (true);


-- ============================================================
-- Step 1a: New reportContentTypes table
-- ============================================================

create table "public"."reportContentTypes" (
  "id"        uuid                        not null default gen_random_uuid(),
  "clientId"  uuid                        not null,
  "label"     character varying(100)      not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."reportContentTypes" enable row level security;

CREATE UNIQUE INDEX "reportContentTypes_pkey"           ON public."reportContentTypes" USING btree (id);
CREATE UNIQUE INDEX "reportContentTypes_client_label_idx" ON public."reportContentTypes" USING btree ("clientId", label);
CREATE UNIQUE INDEX "reportContentTypes_client_id_idx"   ON public."reportContentTypes" USING btree ("clientId", id);

alter table "public"."reportContentTypes" add constraint "reportContentTypes_pkey" PRIMARY KEY using index "reportContentTypes_pkey";

alter table "public"."reportContentTypes" add constraint "reportContentTypes_clientId_oauth_clients_id_fkey"
  FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;
alter table "public"."reportContentTypes" validate constraint "reportContentTypes_clientId_oauth_clients_id_fkey";

create policy "owner_insert"
  on "public"."reportContentTypes"
  as permissive for insert to authenticated
  with check (auth.uid() = (SELECT "userId" FROM "oauthRegistrations" WHERE "clientId" = "reportContentTypes"."clientId"));

create policy "owner_delete"
  on "public"."reportContentTypes"
  as permissive for delete to authenticated
  using (auth.uid() = (SELECT "userId" FROM "oauthRegistrations" WHERE "clientId" = "reportContentTypes"."clientId"));

create policy "authenticated_select"
  on "public"."reportContentTypes"
  as permissive for select to authenticated
  using (true);


-- ============================================================
-- Step 1b: Replace reason + contentType on contentReports
-- ============================================================

alter table "public"."contentReports"
  drop column "reason",
  add column "reasonId"      uuid not null,
  add column "contentTypeId" uuid;

alter table "public"."contentReports"
  add constraint "contentReports_clientId_reasonId_fkey"
    FOREIGN KEY ("clientId", "reasonId") REFERENCES "reportReasons"("clientId", "id") ON DELETE RESTRICT not valid;
alter table "public"."contentReports" validate constraint "contentReports_clientId_reasonId_fkey";

alter table "public"."contentReports"
  add constraint "contentReports_clientId_contentTypeId_fkey"
    FOREIGN KEY ("clientId", "contentTypeId") REFERENCES "reportContentTypes"("clientId", "id") ON DELETE RESTRICT not valid;
alter table "public"."contentReports" validate constraint "contentReports_clientId_contentTypeId_fkey";

-- One active report per content item per client (enables SDK dedup / corroboration)
CREATE UNIQUE INDEX "contentReports_client_content_idx"
  ON "contentReports" ("clientId", "contentId");

-- contentType varchar column is now replaced by contentTypeId FK
alter table "public"."contentReports" drop column "contentType";


-- ============================================================
-- Step 1b: Replace reason on reportCorroborations
-- ============================================================

alter table "public"."reportCorroborations"
  drop column "reason",
  add column "reasonId" uuid not null;

alter table "public"."reportCorroborations"
  add constraint "reportCorroborations_reasonId_fkey"
    FOREIGN KEY ("reasonId") REFERENCES "reportReasons"("id") ON DELETE RESTRICT not valid;
alter table "public"."reportCorroborations" validate constraint "reportCorroborations_reasonId_fkey";


-- ============================================================
-- Step 1b: Drop reportReason enum (no longer referenced)
-- ============================================================

drop type "public"."reportReason";


-- ============================================================
-- Step 1c: Add 'unverified' to reportStatus enum
-- ============================================================

alter type "public"."reportStatus" add value 'unverified' before 'pending';


-- Step 1c: contentReports.status default is updated in the next migration file
-- (ALTER TYPE ADD VALUE commits implicitly; the new value can't be used in the same transaction)


-- ============================================================
-- Step 1d: Verification tracking columns on contentReports
-- ============================================================

alter table "public"."contentReports"
  add column "verifyAttempts" integer not null default 0,
  add column "nextVerifyAt"   timestamp without time zone;


-- ============================================================
-- Step 1e: Remove reportApiKeyHash from oauthRegistrations
-- ============================================================

alter table "public"."oauthRegistrations" drop column "reportApiKeyHash";


-- ============================================================
-- Step 1f: RLS on contentReports — allow reporters to INSERT
-- ============================================================

-- Replace existing restrictive INSERT block with a permissive reporter check
drop policy "crud_authenticated_policy_insert" on "public"."contentReports";

create policy "reporter_insert"
  on "public"."contentReports"
  as permissive for insert to authenticated
  with check ((SELECT auth.uid()) = "reporterUserId");

-- Also allow reporters to SELECT their own reports (existing policy already covers this,
-- but the existing check also allows moderators — keep that intact)


-- ============================================================
-- Step 1g: RLS on reportCorroborations — allow corroborators to INSERT + SELECT own
-- ============================================================

drop policy "crud_authenticated_policy_insert" on "public"."reportCorroborations";
drop policy "crud_authenticated_policy_select" on "public"."reportCorroborations";

create policy "corroborator_insert"
  on "public"."reportCorroborations"
  as permissive for insert to authenticated
  with check ((SELECT auth.uid()) = "reporterUserId");

create policy "corroborator_select"
  on "public"."reportCorroborations"
  as permissive for select to authenticated
  using (
    -- Corroborators can read their own submissions
    (SELECT auth.uid()) = "reporterUserId"
    OR
    -- Moderators can read all corroborations for their client
    EXISTS (
      SELECT 1 FROM public."contentReports" cr
      JOIN public."moderatorRoles" mr ON mr."clientId" = cr."clientId"
      WHERE cr.id = "reportCorroborations"."reportId"
        AND mr."userId" = (SELECT auth.uid())
    )
  );


-- ============================================================
-- Step 1h: Feedback schema changes
-- ============================================================

-- Add UNIQUE (clientId, id) to feedbackTopics for composite FK support
CREATE UNIQUE INDEX "feedbackTopics_client_id_idx" ON public."feedbackTopics" USING btree ("clientId", id);

-- Replace topic varchar with topicId FK on siteFeedback
alter table "public"."siteFeedback"
  drop column "topic",
  add column "topicId" uuid;

alter table "public"."siteFeedback"
  add constraint "siteFeedback_clientId_topicId_fkey"
    FOREIGN KEY ("clientId", "topicId") REFERENCES "feedbackTopics"("clientId", "id") ON DELETE RESTRICT not valid;
alter table "public"."siteFeedback" validate constraint "siteFeedback_clientId_topicId_fkey";

-- Enforce: first-party submissions (no clientId) also have no topicId, and vice versa
alter table "public"."siteFeedback"
  add constraint "siteFeedback_topic_xor_clientId"
    CHECK (("clientId" IS NULL) = ("topicId" IS NULL));

-- Allow authenticated users to SELECT from feedbackTopics (previously blocked)
-- so the SDK can call getTopics() via PostgREST
drop policy "crud_public_policy_select" on "public"."feedbackTopics";

create policy "authenticated_select"
  on "public"."feedbackTopics"
  as permissive for select to authenticated
  using (true);

-- Allow feedbackTopics owners to INSERT and DELETE via PostgREST
drop policy "crud_public_policy_insert" on "public"."feedbackTopics";
drop policy "crud_public_policy_delete" on "public"."feedbackTopics";

create policy "owner_insert"
  on "public"."feedbackTopics"
  as permissive for insert to authenticated
  with check (auth.uid() = (SELECT "userId" FROM "oauthRegistrations" WHERE "clientId" = "feedbackTopics"."clientId"));

create policy "owner_delete"
  on "public"."feedbackTopics"
  as permissive for delete to authenticated
  using (auth.uid() = (SELECT "userId" FROM "oauthRegistrations" WHERE "clientId" = "feedbackTopics"."clientId"));
