create type "platform"."graduationSemester" as enum ('spring', 'summer', 'fall');


create table "platform"."profile" (
  "userId" uuid not null,
  "preferredName" character varying(255) not null,
  "bio" character varying(127),
  "pronouns" text[],
  "graduationSemester" platform."graduationSemester",
  "graduationYear" integer,
  "showGithub" boolean not null default false,
  "showDiscord" boolean not null default false,
  "showEmail" boolean not null default false,
  "showLinkedin" boolean not null default false,
  "viewedConsole" boolean not null default false,
  "involvementFirstName" text,
  "involvementLastName" text,
  "involvementImportedAt" timestamp without time zone,
  "roleDescription" character varying(127)
);

alter table "platform"."profile" enable row level security;

create table "platform"."profileLinks" (
  "id" uuid not null default gen_random_uuid(),
  "userId" uuid not null,
  "url" text not null,
  "title" character varying(64) not null,
  "sortOrder" double precision not null default 0,
  "createdAt" timestamp without time zone default now()
);

alter table "platform"."profileLinks" enable row level security;


CREATE UNIQUE INDEX profile_pkey ON platform.profile USING btree ("userId");

CREATE UNIQUE INDEX "profileLinks_pkey" ON platform."profileLinks" USING btree (id);

CREATE UNIQUE INDEX "profileLinks_userId_sortOrder_key" ON platform."profileLinks" USING btree ("userId", "sortOrder");


alter table "platform"."profile" add constraint "profile_pkey" PRIMARY KEY using index "profile_pkey";

alter table "platform"."profileLinks" add constraint "profileLinks_pkey" PRIMARY KEY using index "profileLinks_pkey";

alter table "platform"."profile" add constraint "profile_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "platform"."profile" validate constraint "profile_userId_users_id_fkey";

alter table "platform"."profileLinks" add constraint "profileLinks_userId_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES platform.profile("userId") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "platform"."profileLinks" validate constraint "profileLinks_userId_profile_userId_fkey";

alter table "platform"."profileLinks" add constraint "profileLinks_userId_sortOrder_key" UNIQUE using index "profileLinks_userId_sortOrder_key";


create or replace view "platform"."profileWithVerification" with (security_invoker = true) as  SELECT "userId",
    ((pronouns IS NOT NULL) AND (array_length(pronouns, 1) > 0)) AS "hasPronouns",
    (("graduationSemester" IS NOT NULL) AND ("graduationYear" IS NOT NULL)) AS "hasGraduationDate",
    (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))) AS "hasGithub",
    (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text)))) AS "hasDiscord",
    (("involvementFirstName" IS NOT NULL) AND (lower(TRIM(BOTH FROM "preferredName")) = lower(((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName"))))) AS "nameMatchesInvolvement",
    ((pronouns IS NOT NULL) AND (array_length(pronouns, 1) > 0) AND ("graduationSemester" IS NOT NULL) AND ("graduationYear" IS NOT NULL) AND ("involvementFirstName" IS NOT NULL) AND (lower(TRIM(BOTH FROM "preferredName")) = lower(((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")))) AND (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))) AND (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text))))) AS verified
   FROM platform.profile p;


create policy "crud_authenticated_policy_delete"
  on "platform"."profile"
  as restrictive
  for delete
  to authenticated
using (false);

create policy "crud_authenticated_policy_insert"
  on "platform"."profile"
  as restrictive
  for insert
  to authenticated
with check (false);

create policy "crud_authenticated_policy_select"
  on "platform"."profile"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_update"
  on "platform"."profile"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"))
with check ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_delete"
  on "platform"."profileLinks"
  as permissive
  for delete
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_insert"
  on "platform"."profileLinks"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_select"
  on "platform"."profileLinks"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"));

create policy "crud_authenticated_policy_update"
  on "platform"."profileLinks"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = "userId"))
with check ((( SELECT auth.uid() AS uid) = "userId"));
