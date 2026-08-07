create type "platform"."credentialType" as enum ('email_password', 'totp', 'email_password_totp');

create type "platform"."roleType" as enum ('default', 'root', 'custom');


create table "platform"."credentials" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "description" text,
  "type" platform."credentialType" not null,
  "email" text,
  "passwordSecretId" uuid,
  "totpSecretId" uuid,
  "createdAt" timestamp with time zone not null default now(),
  "createdBy" uuid
);

alter table "platform"."credentials" enable row level security;

create table "platform"."roles" (
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
  "roleType" platform."roleType" not null default 'custom'::platform."roleType",
  "showOnProfile" boolean not null default true,
  "isLeadership" boolean not null default false,
  "discordRoleId" text,
  "discordSyncedName" text,
  "discordSyncedColor" integer
);

alter table "platform"."roles" enable row level security;

create table "platform"."credentialRoles" (
  "credentialId" uuid not null,
  "roleId" uuid not null
);

alter table "platform"."credentialRoles" enable row level security;

create table "platform"."userRoles" (
  "userId" uuid not null,
  "roleId" uuid not null
);

alter table "platform"."userRoles" enable row level security;


CREATE UNIQUE INDEX credentials_pkey ON platform.credentials USING btree (id);

CREATE UNIQUE INDEX "credentialRoles_pkey" ON platform."credentialRoles" USING btree ("credentialId", "roleId");

CREATE UNIQUE INDEX roles_pkey ON platform.roles USING btree (id);

CREATE UNIQUE INDEX roles_rank_key ON platform.roles USING btree (rank);

CREATE UNIQUE INDEX roles_title_key ON platform.roles USING btree (title);

CREATE UNIQUE INDEX "roles_discordRoleId_key" ON platform.roles USING btree ("discordRoleId");

CREATE UNIQUE INDEX "userRoles_pkey" ON platform."userRoles" USING btree ("userId", "roleId");

CREATE UNIQUE INDEX "userRoles_root_singleton" ON platform."userRoles" USING btree ("roleId") WHERE ("roleId" = '00000000-0000-0000-0000-000000000002'::uuid);


alter table "platform"."credentials" add constraint "credentials_pkey" PRIMARY KEY using index "credentials_pkey";

alter table "platform"."credentialRoles" add constraint "credentialRoles_pkey" PRIMARY KEY using index "credentialRoles_pkey";

alter table "platform"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "platform"."userRoles" add constraint "userRoles_pkey" PRIMARY KEY using index "userRoles_pkey";

alter table "platform"."roles" add constraint "roles_custom_requires_rank" CHECK ((("roleType" = 'custom'::platform."roleType") = (rank IS NOT NULL))) not valid;

alter table "platform"."roles" validate constraint "roles_custom_requires_rank";

alter table "platform"."roles" add constraint "roles_discordRoleId_key" UNIQUE using index "roles_discordRoleId_key";

alter table "platform"."roles" add constraint "roles_rank_key" UNIQUE using index "roles_rank_key";

alter table "platform"."roles" add constraint "roles_title_key" UNIQUE using index "roles_title_key";

alter table "platform"."credentials" add constraint "credentials_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "platform"."credentials" validate constraint "credentials_createdBy_users_id_fkey";

alter table "platform"."credentialRoles" add constraint "credentialRoles_credentialId_credentials_id_fkey" FOREIGN KEY ("credentialId") REFERENCES platform.credentials(id) ON DELETE CASCADE not valid;

alter table "platform"."credentialRoles" validate constraint "credentialRoles_credentialId_credentials_id_fkey";

alter table "platform"."credentialRoles" add constraint "credentialRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES platform.roles(id) ON DELETE CASCADE not valid;

alter table "platform"."credentialRoles" validate constraint "credentialRoles_roleId_roles_id_fkey";

alter table "platform"."userRoles" add constraint "userRoles_roleId_roles_id_fkey" FOREIGN KEY ("roleId") REFERENCES platform.roles(id) ON DELETE CASCADE not valid;

alter table "platform"."userRoles" validate constraint "userRoles_roleId_roles_id_fkey";

alter table "platform"."userRoles" add constraint "userRoles_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "platform"."userRoles" validate constraint "userRoles_userId_users_id_fkey";


create policy "crud_public_policy_delete"
  on "platform"."credentials"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."credentials"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."credentials"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."credentials"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."credentialRoles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."credentialRoles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."credentialRoles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."credentialRoles"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_authenticated_policy_delete"
  on "platform"."roles"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."roles"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."roles"
  as permissive
  for select
  to authenticated
using (true);

create policy "crud_authenticated_policy_update"
  on "platform"."roles"
  as restrictive
  for update
  to authenticated
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."userRoles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."userRoles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."userRoles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."userRoles"
  as restrictive
  for update
  to public
using (false)
with check (false);
