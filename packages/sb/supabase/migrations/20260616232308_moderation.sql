create type "public"."contentAction" as enum ('quarantine', 'no_action');

create type "public"."filerAction" as enum ('warn', 'suspend', 'no_action');

create type "public"."reportReason" as enum ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other');

create type "public"."reportStatus" as enum ('pending', 'resolved', 'dismissed');

create type "public"."subjectAction" as enum ('warn', 'suspend', 'ban', 'no_action');


create table "public"."contentReports" (
  "id" uuid not null default gen_random_uuid(),
  "clientId" uuid not null,
  "reporterUserId" uuid not null,
  "reportedUserId" uuid not null,
  "contentId" text not null,
  "contentType" character varying(64),
  "contentSnapshot" character varying(5000) not null,
  "contentUrl" text,
  "reason" public."reportReason" not null,
  "description" character varying(1000),
  "status" public."reportStatus" not null default 'pending'::public."reportStatus",
  "createdAt" timestamp without time zone not null default now(),
  "resolvedAt" timestamp without time zone
);

alter table "public"."contentReports" enable row level security;

create table "public"."reportCorroborations" (
  "id" uuid not null default gen_random_uuid(),
  "reportId" uuid not null,
  "reporterUserId" uuid not null,
  "reason" public."reportReason" not null,
  "description" character varying(1000),
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."reportCorroborations" enable row level security;

create table "public"."reportResolutions" (
  "id" uuid not null default gen_random_uuid(),
  "reportId" uuid not null,
  "moderatorUserId" uuid not null,
  "subjectAction" public."subjectAction" not null,
  "filerAction" public."filerAction" not null,
  "contentAction" public."contentAction" not null,
  "appliedGlobally" boolean not null default false,
  "moderatorNote" text,
  "webhookAttempts" integer not null default 0,
  "nextRetryAt" timestamp without time zone,
  "notifiedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."reportResolutions" enable row level security;

create table "public"."moderatorRoles" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "clientId" uuid not null,
  "grantedByUserId" uuid not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."moderatorRoles" enable row level security;

create table "public"."userSuspensions" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "service" text not null,
  "reason" text,
  "suspendedAt" timestamp without time zone not null default now(),
  "suspendedBy" uuid
);

alter table "public"."userSuspensions" enable row level security;


CREATE UNIQUE INDEX "contentReports_pkey" ON public."contentReports" USING btree (id);

CREATE UNIQUE INDEX "reportCorroborations_pkey" ON public."reportCorroborations" USING btree (id);

CREATE UNIQUE INDEX "reportCorroborations_report_reporter_idx" ON public."reportCorroborations" USING btree ("reportId", "reporterUserId");

CREATE UNIQUE INDEX "reportResolutions_pkey" ON public."reportResolutions" USING btree (id);

CREATE UNIQUE INDEX "reportResolutions_reportId_key" ON public."reportResolutions" USING btree ("reportId");

CREATE UNIQUE INDEX "moderatorRoles_pkey" ON public."moderatorRoles" USING btree (id);

CREATE UNIQUE INDEX "moderatorRoles_user_client_idx" ON public."moderatorRoles" USING btree ("userId", "clientId");

CREATE UNIQUE INDEX "userSuspensions_pkey" ON public."userSuspensions" USING btree (id);

CREATE UNIQUE INDEX "userSuspensions_user_service_idx" ON public."userSuspensions" USING btree ("userId", service);


alter table "public"."contentReports" add constraint "contentReports_pkey" PRIMARY KEY using index "contentReports_pkey";

alter table "public"."reportCorroborations" add constraint "reportCorroborations_pkey" PRIMARY KEY using index "reportCorroborations_pkey";

alter table "public"."reportResolutions" add constraint "reportResolutions_pkey" PRIMARY KEY using index "reportResolutions_pkey";

alter table "public"."moderatorRoles" add constraint "moderatorRoles_pkey" PRIMARY KEY using index "moderatorRoles_pkey";

alter table "public"."userSuspensions" add constraint "userSuspensions_pkey" PRIMARY KEY using index "userSuspensions_pkey";

alter table "public"."reportResolutions" add constraint "reportResolutions_reportId_key" UNIQUE using index "reportResolutions_reportId_key";

alter table "public"."contentReports" add constraint "contentReports_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;

alter table "public"."contentReports" validate constraint "contentReports_clientId_oauth_clients_id_fkey";

alter table "public"."contentReports" add constraint "contentReports_reportedUserId_users_id_fkey" FOREIGN KEY ("reportedUserId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."contentReports" validate constraint "contentReports_reportedUserId_users_id_fkey";

alter table "public"."contentReports" add constraint "contentReports_reporterUserId_users_id_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."contentReports" validate constraint "contentReports_reporterUserId_users_id_fkey";

alter table "public"."reportCorroborations" add constraint "reportCorroborations_reportId_contentReports_id_fkey" FOREIGN KEY ("reportId") REFERENCES public."contentReports"(id) ON DELETE CASCADE not valid;

alter table "public"."reportCorroborations" validate constraint "reportCorroborations_reportId_contentReports_id_fkey";

alter table "public"."reportCorroborations" add constraint "reportCorroborations_reporterUserId_users_id_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."reportCorroborations" validate constraint "reportCorroborations_reporterUserId_users_id_fkey";

alter table "public"."reportResolutions" add constraint "reportResolutions_moderatorUserId_users_id_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."reportResolutions" validate constraint "reportResolutions_moderatorUserId_users_id_fkey";

alter table "public"."reportResolutions" add constraint "reportResolutions_reportId_contentReports_id_fkey" FOREIGN KEY ("reportId") REFERENCES public."contentReports"(id) ON DELETE CASCADE not valid;

alter table "public"."reportResolutions" validate constraint "reportResolutions_reportId_contentReports_id_fkey";

alter table "public"."moderatorRoles" add constraint "moderatorRoles_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;

alter table "public"."moderatorRoles" validate constraint "moderatorRoles_clientId_oauth_clients_id_fkey";

alter table "public"."moderatorRoles" add constraint "moderatorRoles_grantedByUserId_users_id_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."moderatorRoles" validate constraint "moderatorRoles_grantedByUserId_users_id_fkey";

alter table "public"."moderatorRoles" add constraint "moderatorRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."moderatorRoles" validate constraint "moderatorRoles_userId_users_id_fkey";

alter table "public"."userSuspensions" add constraint "userSuspensions_suspendedBy_users_id_fkey" FOREIGN KEY ("suspendedBy") REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."userSuspensions" validate constraint "userSuspensions_suspendedBy_users_id_fkey";

alter table "public"."userSuspensions" add constraint "userSuspensions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."userSuspensions" validate constraint "userSuspensions_userId_users_id_fkey";


create policy "crud_authenticated_policy_delete"
  on "public"."contentReports"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "public"."contentReports"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "public"."contentReports"
  as permissive
  for select
  to authenticated
using (((( SELECT auth.uid() AS uid) = "reporterUserId") OR (EXISTS ( SELECT 1
   FROM public."moderatorRoles" mr
  WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = "contentReports"."clientId"))))));

create policy "crud_authenticated_policy_update"
  on "public"."contentReports"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "public"."reportCorroborations"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "public"."reportCorroborations"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "public"."reportCorroborations"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public."contentReports" cr
     JOIN public."moderatorRoles" mr ON ((mr."clientId" = cr."clientId")))
  WHERE ((cr.id = "reportCorroborations"."reportId") AND (mr."userId" = ( SELECT auth.uid() AS uid))))));

create policy "crud_authenticated_policy_update"
  on "public"."reportCorroborations"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "public"."reportResolutions"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "public"."reportResolutions"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "public"."reportResolutions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public."contentReports" cr
  WHERE ((cr.id = "reportResolutions"."reportId") AND ((cr."reporterUserId" = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM public."moderatorRoles" mr
          WHERE ((mr."userId" = ( SELECT auth.uid() AS uid)) AND (mr."clientId" = cr."clientId")))))))));

create policy "crud_authenticated_policy_update"
  on "public"."reportResolutions"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "public"."moderatorRoles"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "public"."moderatorRoles"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "public"."moderatorRoles"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_update"
  on "public"."moderatorRoles"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "public"."userSuspensions"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."userSuspensions"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."userSuspensions"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."userSuspensions"
  as restrictive
  for update
  to public
using (false)
with check (false);
