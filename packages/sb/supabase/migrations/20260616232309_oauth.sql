create type "public"."oauthRegistrationType" as enum ('development', 'production');


create table "public"."oauthRegistrations" (
  "clientId" uuid not null,
  "userId" uuid not null,
  "type" public."oauthRegistrationType" not null default 'development'::public."oauthRegistrationType",
  "reportApiKeyHash" text,
  "reportWebhookUrl" text,
  "reportWebhookSecretId" uuid
);

alter table "public"."oauthRegistrations" enable row level security;

create table "public"."oauthTestAccounts" (
  "testUserId" uuid not null,
  "ownerUserId" uuid not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."oauthTestAccounts" enable row level security;


CREATE UNIQUE INDEX "oauthRegistrations_pkey" ON public."oauthRegistrations" USING btree ("clientId");

CREATE UNIQUE INDEX "oauthRegistrations_userId_key" ON public."oauthRegistrations" USING btree ("userId");

CREATE UNIQUE INDEX "oauthTestAccounts_pkey" ON public."oauthTestAccounts" USING btree ("testUserId");

CREATE UNIQUE INDEX "oauthTestAccounts_ownerUserId_key" ON public."oauthTestAccounts" USING btree ("ownerUserId");


alter table "public"."oauthRegistrations" add constraint "oauthRegistrations_pkey" PRIMARY KEY using index "oauthRegistrations_pkey";

alter table "public"."oauthTestAccounts" add constraint "oauthTestAccounts_pkey" PRIMARY KEY using index "oauthTestAccounts_pkey";

alter table "public"."oauthRegistrations" add constraint "oauthRegistrations_userId_key" UNIQUE using index "oauthRegistrations_userId_key";

alter table "public"."oauthTestAccounts" add constraint "oauthTestAccounts_ownerUserId_key" UNIQUE using index "oauthTestAccounts_ownerUserId_key";

alter table "public"."oauthRegistrations" add constraint "oauthRegistrations_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."oauthRegistrations" validate constraint "oauthRegistrations_clientId_oauth_clients_id_fkey";

alter table "public"."oauthRegistrations" add constraint "oauthRegistrations_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."oauthRegistrations" validate constraint "oauthRegistrations_userId_users_id_fkey";

alter table "public"."oauthTestAccounts" add constraint "oauthTestAccounts_ownerUserId_users_id_fkey" FOREIGN KEY ("ownerUserId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."oauthTestAccounts" validate constraint "oauthTestAccounts_ownerUserId_users_id_fkey";

alter table "public"."oauthTestAccounts" add constraint "oauthTestAccounts_testUserId_users_id_fkey" FOREIGN KEY ("testUserId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."oauthTestAccounts" validate constraint "oauthTestAccounts_testUserId_users_id_fkey";


create policy "crud_public_policy_delete"
  on "public"."oauthRegistrations"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."oauthRegistrations"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."oauthRegistrations"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."oauthRegistrations"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "public"."oauthTestAccounts"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "public"."oauthTestAccounts"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "public"."oauthTestAccounts"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "public"."oauthTestAccounts"
  as restrictive
  for update
  to public
using (false)
with check (false);
