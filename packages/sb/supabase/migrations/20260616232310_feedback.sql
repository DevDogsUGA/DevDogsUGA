create type "public"."feedbackSeverity" as enum ('low', 'medium', 'high');

create type "public"."feedbackStatus" as enum ('open', 'in_review', 'resolved', 'dismissed');

create type "public"."feedbackType" as enum ('bug_report', 'feature_request', 'design_feedback', 'performance', 'content_issue', 'other');


create table "public"."feedbackTopics" (
  "id" uuid not null default gen_random_uuid(),
  "clientId" uuid not null,
  "label" character varying(50) not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."feedbackTopics" enable row level security;

create table "public"."siteFeedback" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "type" public."feedbackType" not null,
  "topic" character varying(50) not null,
  "severity" public."feedbackSeverity",
  "title" character varying(100) not null,
  "description" text not null,
  "status" public."feedbackStatus" not null default 'open'::public."feedbackStatus",
  "browserMetadata" jsonb,
  "attachmentPaths" text[],
  "adminNote" text,
  "createdAt" timestamp without time zone not null default now(),
  "updatedAt" timestamp without time zone not null default now(),
  "clientId" uuid
);

alter table "public"."siteFeedback" enable row level security;


CREATE UNIQUE INDEX "feedbackTopics_pkey" ON public."feedbackTopics" USING btree (id);

CREATE UNIQUE INDEX "feedbackTopics_client_label_idx" ON public."feedbackTopics" USING btree ("clientId", label);

CREATE UNIQUE INDEX "siteFeedback_pkey" ON public."siteFeedback" USING btree (id);


alter table "public"."feedbackTopics" add constraint "feedbackTopics_pkey" PRIMARY KEY using index "feedbackTopics_pkey";

alter table "public"."siteFeedback" add constraint "siteFeedback_pkey" PRIMARY KEY using index "siteFeedback_pkey";

alter table "public"."feedbackTopics" add constraint "feedbackTopics_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE not valid;

alter table "public"."feedbackTopics" validate constraint "feedbackTopics_clientId_oauth_clients_id_fkey";

alter table "public"."siteFeedback" add constraint "siteFeedback_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE SET NULL not valid;

alter table "public"."siteFeedback" validate constraint "siteFeedback_clientId_oauth_clients_id_fkey";

alter table "public"."siteFeedback" add constraint "siteFeedback_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."siteFeedback" validate constraint "siteFeedback_userId_users_id_fkey";


create policy "crud_public_policy_delete"
  on "public"."feedbackTopics"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."feedbackTopics"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."feedbackTopics"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."feedbackTopics"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "public"."siteFeedback"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "public"."siteFeedback"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_select"
  on "public"."siteFeedback"
  as permissive
  for select
  to authenticated
using (((( SELECT auth.uid() AS uid) = "userId") OR (EXISTS ( SELECT 1
   FROM (public."userRoles" ur
     JOIN public.roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true))))));

create policy "crud_authenticated_policy_update"
  on "public"."siteFeedback"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public."userRoles" ur
     JOIN public.roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true)))))
with check ((EXISTS ( SELECT 1
   FROM (public."userRoles" ur
     JOIN public.roles r ON ((r.id = ur."roleId")))
  WHERE ((ur."userId" = ( SELECT auth.uid() AS uid)) AND (r."canManageFeedback" = true)))));
