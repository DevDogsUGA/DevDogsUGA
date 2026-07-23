create type "platform"."contentAction" as enum ('quarantine', 'no_action');

create type "platform"."filerAction" as enum ('warn', 'suspend', 'no_action');

create type "platform"."reportReason" as enum ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other');

create type "platform"."reportStatus" as enum ('pending', 'resolved', 'dismissed');

create type "platform"."subjectAction" as enum ('warn', 'suspend', 'ban', 'no_action');


create table "platform"."contentReports" (
  "id" uuid not null default gen_random_uuid(),
  "clientId" uuid not null,
  "reporterUserId" uuid not null,
  "reportedUserId" uuid not null,
  "contentId" text not null,
  "contentType" character varying(64),
  "contentSnapshot" character varying(5000) not null,
  "contentUrl" text,
  "reason" platform."reportReason" not null,
  "description" character varying(1000),
  "status" platform."reportStatus" not null default 'pending'::platform."reportStatus",
  "createdAt" timestamp without time zone not null default now(),
  "resolvedAt" timestamp without time zone
);

alter table "platform"."contentReports" enable row level security;

create table "platform"."reportCorroborations" (
  "id" uuid not null default gen_random_uuid(),
  "reportId" uuid not null,
  "reporterUserId" uuid not null,
  "reason" platform."reportReason" not null,
  "description" character varying(1000),
  "createdAt" timestamp without time zone not null default now()
);

alter table "platform"."reportCorroborations" enable row level security;

create table "platform"."reportResolutions" (
  "id" uuid not null default gen_random_uuid(),
  "reportId" uuid not null,
  "moderatorUserId" uuid not null,
  "subjectAction" platform."subjectAction" not null,
  "filerAction" platform."filerAction" not null,
  "contentAction" platform."contentAction" not null,
  "appliedGlobally" boolean not null default false,
  "moderatorNote" text,
  "webhookAttempts" integer not null default 0,
  "nextRetryAt" timestamp without time zone,
  "notifiedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default now()
);

alter table "platform"."reportResolutions" enable row level security;

create table "platform"."moderatorRoles" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "clientId" uuid not null,
  "grantedByUserId" uuid not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "platform"."moderatorRoles" enable row level security;

create table "platform"."userSuspensions" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "service" text not null,
  "reason" text,
  "suspendedAt" timestamp without time zone not null default now(),
  "suspendedBy" uuid
);

alter table "platform"."userSuspensions" enable row level security;


CREATE UNIQUE INDEX "contentReports_pkey" ON platform."contentReports" USING btree (id);

CREATE UNIQUE INDEX "reportCorroborations_pkey" ON platform."reportCorroborations" USING btree (id);

CREATE UNIQUE INDEX "reportCorroborations_report_reporter_idx" ON platform."reportCorroborations" USING btree ("reportId", "reporterUserId");

CREATE UNIQUE INDEX "reportResolutions_pkey" ON platform."reportResolutions" USING btree (id);

CREATE UNIQUE INDEX "reportResolutions_reportId_key" ON platform."reportResolutions" USING btree ("reportId");

CREATE UNIQUE INDEX "moderatorRoles_pkey" ON platform."moderatorRoles" USING btree (id);

CREATE UNIQUE INDEX "moderatorRoles_user_client_idx" ON platform."moderatorRoles" USING btree ("userId", "clientId");

CREATE UNIQUE INDEX "userSuspensions_pkey" ON platform."userSuspensions" USING btree (id);

CREATE UNIQUE INDEX "userSuspensions_user_service_idx" ON platform."userSuspensions" USING btree ("userId", service);


alter table "platform"."contentReports" add constraint "contentReports_pkey" PRIMARY KEY using index "contentReports_pkey";

alter table "platform"."reportCorroborations" add constraint "reportCorroborations_pkey" PRIMARY KEY using index "reportCorroborations_pkey";

alter table "platform"."reportResolutions" add constraint "reportResolutions_pkey" PRIMARY KEY using index "reportResolutions_pkey";

alter table "platform"."moderatorRoles" add constraint "moderatorRoles_pkey" PRIMARY KEY using index "moderatorRoles_pkey";

alter table "platform"."userSuspensions" add constraint "userSuspensions_pkey" PRIMARY KEY using index "userSuspensions_pkey";

alter table "platform"."reportResolutions" add constraint "reportResolutions_reportId_key" UNIQUE using index "reportResolutions_reportId_key";

alter table "platform"."contentReports" add constraint "contentReports_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;

alter table "platform"."contentReports" validate constraint "contentReports_clientId_oauth_clients_id_fkey";

alter table "platform"."contentReports" add constraint "contentReports_reportedUserId_users_id_fkey" FOREIGN KEY ("reportedUserId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "platform"."contentReports" validate constraint "contentReports_reportedUserId_users_id_fkey";

alter table "platform"."contentReports" add constraint "contentReports_reporterUserId_users_id_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "platform"."contentReports" validate constraint "contentReports_reporterUserId_users_id_fkey";

alter table "platform"."reportCorroborations" add constraint "reportCorroborations_reportId_contentReports_id_fkey" FOREIGN KEY ("reportId") REFERENCES platform."contentReports"(id) ON DELETE CASCADE not valid;

alter table "platform"."reportCorroborations" validate constraint "reportCorroborations_reportId_contentReports_id_fkey";

alter table "platform"."reportCorroborations" add constraint "reportCorroborations_reporterUserId_users_id_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "platform"."reportCorroborations" validate constraint "reportCorroborations_reporterUserId_users_id_fkey";

alter table "platform"."reportResolutions" add constraint "reportResolutions_moderatorUserId_users_id_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "platform"."reportResolutions" validate constraint "reportResolutions_moderatorUserId_users_id_fkey";

alter table "platform"."reportResolutions" add constraint "reportResolutions_reportId_contentReports_id_fkey" FOREIGN KEY ("reportId") REFERENCES platform."contentReports"(id) ON DELETE CASCADE not valid;

alter table "platform"."reportResolutions" validate constraint "reportResolutions_reportId_contentReports_id_fkey";

alter table "platform"."moderatorRoles" add constraint "moderatorRoles_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;

alter table "platform"."moderatorRoles" validate constraint "moderatorRoles_clientId_oauth_clients_id_fkey";

alter table "platform"."moderatorRoles" add constraint "moderatorRoles_grantedByUserId_users_id_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "platform"."moderatorRoles" validate constraint "moderatorRoles_grantedByUserId_users_id_fkey";

alter table "platform"."moderatorRoles" add constraint "moderatorRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "platform"."moderatorRoles" validate constraint "moderatorRoles_userId_users_id_fkey";

alter table "platform"."userSuspensions" add constraint "userSuspensions_suspendedBy_users_id_fkey" FOREIGN KEY ("suspendedBy") REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "platform"."userSuspensions" validate constraint "userSuspensions_suspendedBy_users_id_fkey";

alter table "platform"."userSuspensions" add constraint "userSuspensions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "platform"."userSuspensions" validate constraint "userSuspensions_userId_users_id_fkey";


create policy "crud_authenticated_policy_delete"
  on "platform"."contentReports"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."contentReports"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."contentReports"
  as permissive
  for select
  to authenticated
using (((( SELECT auth.uid() AS uid) = "reporterUserId") OR (EXISTS ( SELECT 1
   FROM platform."moderatorRoles" mr
  WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = "contentReports"."clientId"))))));

create policy "crud_authenticated_policy_update"
  on "platform"."contentReports"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "platform"."reportCorroborations"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."reportCorroborations"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."reportCorroborations"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (platform."contentReports" cr
     JOIN platform."moderatorRoles" mr ON ((mr."clientId" = cr."clientId")))
  WHERE ((cr.id = "reportCorroborations"."reportId") AND (mr."userId" = ( SELECT auth.uid() AS uid))))));

create policy "crud_authenticated_policy_update"
  on "platform"."reportCorroborations"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "platform"."reportResolutions"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."reportResolutions"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."reportResolutions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM platform."contentReports" cr
  WHERE ((cr.id = "reportResolutions"."reportId") AND ((cr."reporterUserId" = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM platform."moderatorRoles" mr
          WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = cr."clientId")))))))));

create policy "crud_authenticated_policy_update"
  on "platform"."reportResolutions"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "platform"."moderatorRoles"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."moderatorRoles"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."moderatorRoles"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_update"
  on "platform"."moderatorRoles"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."userSuspensions"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."userSuspensions"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."userSuspensions"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."userSuspensions"
  as restrictive
  for update
  to public
using (false)
with check (false);
