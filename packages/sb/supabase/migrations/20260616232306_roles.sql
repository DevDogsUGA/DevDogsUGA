create type "public"."credentialType" as enum ('email_password', 'totp', 'email_password_totp');

create type "public"."roleType" as enum ('default', 'root', 'custom');


create table "public"."credentials" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "description" text,
  "type" public."credentialType" not null,
  "email" text,
  "passwordSecretId" uuid,
  "totpSecretId" uuid,
  "createdAt" timestamp with time zone not null default now(),
  "createdBy" uuid
);

alter table "public"."credentials" enable row level security;

create table "public"."roles" (
  "id" uuid not null default gen_random_uuid(),
  "title" character varying(64) not null,
  "description" text not null default ''::text,
  "rank" double precision,
  "color" character varying(7),
  "canModerate" boolean,
  "canManageRoles" boolean,
  "canManageSuspensions" boolean,
  "canViewAuditLog" boolean,
  "canManageFeedback" boolean,
  "canCreateCredentials" boolean,
  "canManageVerification" boolean,
  "createdAt" timestamp without time zone not null default now(),
  "roleType" public."roleType" not null default 'custom'::public."roleType",
  "showOnProfile" boolean not null default true,
  "isLeadership" boolean not null default false,
  "discordRoleId" text,
  "discordSyncedName" text,
  "discordSyncedColor" integer
);

alter table "public"."roles" enable row level security;

create table "public"."credentialRoles" (
  "credentialId" uuid not null,
  "roleId" uuid not null
);

alter table "public"."credentialRoles" enable row level security;

create table "public"."userRoles" (
  "userId" uuid not null,
  "roleId" uuid not null
);

alter table "public"."userRoles" enable row level security;


CREATE UNIQUE INDEX credentials_pkey ON public.credentials USING btree (id);

CREATE UNIQUE INDEX "credentialRoles_pkey" ON public."credentialRoles" USING btree ("credentialId", "roleId");

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX roles_rank_key ON public.roles USING btree (rank);

CREATE UNIQUE INDEX roles_title_key ON public.roles USING btree (title);

CREATE UNIQUE INDEX "roles_discordRoleId_key" ON public.roles USING btree ("discordRoleId");

CREATE UNIQUE INDEX "userRoles_pkey" ON public."userRoles" USING btree ("userId", "roleId");

CREATE UNIQUE INDEX "userRoles_root_singleton" ON public."userRoles" USING btree ("roleId") WHERE ("roleId" = '00000000-0000-0000-0000-000000000002'::uuid);


alter table "public"."credentials" add constraint "credentials_pkey" PRIMARY KEY using index "credentials_pkey";

alter table "public"."credentialRoles" add constraint "credentialRoles_pkey" PRIMARY KEY using index "credentialRoles_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."userRoles" add constraint "userRoles_pkey" PRIMARY KEY using index "userRoles_pkey";

alter table "public"."roles" add constraint "roles_custom_requires_rank" CHECK ((("roleType" = 'custom'::public."roleType") = (rank IS NOT NULL))) not valid;

alter table "public"."roles" validate constraint "roles_custom_requires_rank";

alter table "public"."roles" add constraint "roles_discordRoleId_key" UNIQUE using index "roles_discordRoleId_key";

alter table "public"."roles" add constraint "roles_rank_key" UNIQUE using index "roles_rank_key";

alter table "public"."roles" add constraint "roles_title_key" UNIQUE using index "roles_title_key";

alter table "public"."credentials" add constraint "credentials_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."credentials" validate constraint "credentials_createdBy_users_id_fkey";

alter table "public"."credentialRoles" add constraint "credentialRoles_credentialId_credentials_id_fkey" FOREIGN KEY ("credentialId") REFERENCES public.credentials(id) ON DELETE CASCADE not valid;

alter table "public"."credentialRoles" validate constraint "credentialRoles_credentialId_credentials_id_fkey";

alter table "public"."credentialRoles" add constraint "credentialRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."credentialRoles" validate constraint "credentialRoles_roleId_roles_id_fkey";

alter table "public"."userRoles" add constraint "userRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."userRoles" validate constraint "userRoles_roleId_roles_id_fkey";

alter table "public"."userRoles" add constraint "userRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."userRoles" validate constraint "userRoles_userId_users_id_fkey";


create policy "crud_public_policy_delete"
  on "public"."credentials"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."credentials"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."credentials"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."credentials"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "public"."credentialRoles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."credentialRoles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."credentialRoles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."credentialRoles"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "public"."roles"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "public"."roles"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "public"."roles"
  as permissive
  for select
  to authenticated
using (true);

create policy "crud_authenticated_policy_update"
  on "public"."roles"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "public"."userRoles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."userRoles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."userRoles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."userRoles"
  as restrictive
  for update
  to public
using (false)
with check (false);
