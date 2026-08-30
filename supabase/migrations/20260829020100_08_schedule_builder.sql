-- Schedule Builder: the whole `schedule_builder` schema. One enum, seventeen
-- tables of scraped UGA registrar data, one view, one materialized view, and
-- the row level security that makes the catalog readable but not writable.
--
-- The one thing to know: this file grants nothing. `alter default privileges in
-- schema schedule_builder grant all on tables to anon, authenticated,
-- service_role` lives in the first migration and applies only to objects
-- created after it by the same role. That statement is the only source of table
-- privileges in this schema, so every table below inherits its PostgREST
-- reachability from it. Move any `create table` here above that file, or run
-- part of the set as a second role, and those tables come out with no client
-- privileges at all: PostgREST answers "permission denied for table" and the
-- migration log shows nothing wrong.
--
-- Nothing writes these tables through PostgREST. The registrar scrapers connect
-- as postgres over DB_URL, which bypasses RLS entirely, so the policies at the
-- bottom of this file cost the scrape path nothing.

-- How much is known about where a section meets. The parser maps the
-- registrar's building field: blank or "TBA" gives 'TBA', "NCRR" gives 'NCRR',
-- and anything else gives 'RESERVED' with a real buildingId alongside it.
-- Labels are compared in declaration order, so the order is part of the type.
create type "schedule_builder"."locationStatus" as enum ('TBA', 'NCRR', 'RESERVED');

-- Catalog tables
--
-- Everything in this block is scraped reference data with an upstream owner.
-- Where a table has no `serial`, that is deliberate: the key is the registrar's
-- own number, and reusing it is what lets a scrape upsert instead of diff.

-- `id` is the registrar's building number, not a sequence.
create table "schedule_builder"."buildings" (
  "id"          integer primary key,
  "description" varchar not null,
  "address"     varchar,
  "latitude"    double precision,
  "longitude"   double precision
);

create table "schedule_builder"."campuses" (
  "id"          serial primary key,
  "abbr"        varchar not null unique,
  "description" varchar not null
);

create table "schedule_builder"."colleges" (
  "id"          serial primary key,
  "description" varchar not null unique
);

create table "schedule_builder"."departments" (
  "id"          serial primary key,
  "description" varchar not null unique,
  "collegeId"   integer not null
);

create table "schedule_builder"."subjects" (
  "id"          serial primary key,
  "abbr"        varchar(4) not null unique,
  "description" varchar not null
);

create table "schedule_builder"."scheduleTypes" (
  "id"          serial primary key,
  "abbr"        varchar not null unique,
  "description" varchar not null
);

create table "schedule_builder"."instructors" (
  "id"                   serial primary key,
  "firstName"            varchar not null,
  "lastName"             varchar not null,
  "totalReviews"         integer default 0 not null,
  "averageRating"        real default 0 not null,
  "difficultyRating"     real default 0 not null,
  "wouldTakeAgainRating" integer default 0 not null,
  -- Name is the only identity the feed gives an instructor, so it has to be
  -- the upsert key. Two people who share both names collapse into one row.
  constraint "unique_full_name" unique ("firstName", "lastName")
);

create table "schedule_builder"."courses" (
  "id"                    serial primary key,
  "abbr"                  varchar not null unique,
  "title"                 varchar not null,
  "abbrTitle"             varchar not null,
  "courseNumber"          varchar not null,
  "minCreditHours"        real not null,
  "maxCreditHours"        real not null,
  "minBillingCreditHours" real not null,
  "honors"                boolean default false not null,
  "collegeId"             integer not null,
  "departmentId"          integer,
  "subjectId"             integer not null,
  -- The natural key the scraper upserts on. This name is not Drizzle's default
  -- shape and application code names it, so do not "normalize" it.
  constraint "unique_subject_courseNumber" unique ("subjectId", "courseNumber")
);

-- Catalog prose that only some courses have, fetched on its own schedule.
-- Split from `courses` because it is fetched per course from a second endpoint,
-- so it lags the course row and carries its own `lastFetched`.
create table "schedule_builder"."courseDetails" (
  "id"                serial primary key,
  "description"       text,
  "gradingSystem"     varchar,
  "semesterOffered"   varchar,
  "corequisite"       text,
  "equivalentCourses" text,
  "lastFetched"       timestamp not null,
  "courseId"          integer not null,
  "prerequisites"     jsonb
);

-- One academic term. `academicPeriod` is the registrar's period number, used as
-- the key everywhere in this schema and in the app's URLs.
create table "schedule_builder"."terms" (
  "academicPeriod" integer primary key,
  "description"    varchar not null
);

-- The deadlines that vary by session within a term, so the pkey is composite.
-- Both key columns are declared nullable and the constraint makes them not
-- null, which is what the generated original did.
create table "schedule_builder"."partsOfTerm" (
  "academicPeriod"     integer,
  "code"               varchar,
  "description"        varchar not null,
  "classesBegin"       date not null,
  "dropAddEnds"        date not null,
  "censusDate"         date not null,
  "withdrawalDeadline" date not null,
  "classesEnd"         date not null,
  "finalsEnd"          date,
  constraint "partsOfTerm_pkey" primary key ("academicPeriod", "code")
);

-- A section. `crn` is the registrar's course reference number and is the
-- primary key, so a section keeps its identity across scrapes.
create table "schedule_builder"."offerings" (
  "crn"               integer primary key,
  "crossListingId"    varchar,
  "minimumEnrollment" integer default 0 not null,
  "maximumEnrollment" integer not null,
  "actualEnrollment"  integer not null,
  "seatsAvailable"    integer not null,
  "active"            boolean not null,
  "academicPeriod"    integer not null,
  "partOfTerm"        varchar not null,
  "courseId"          integer not null,
  "instructorId"      integer,
  "scheduleTypeId"    integer not null,
  "campusId"          integer not null
);

-- When and where a section meets. One section can have several rows: a lecture
-- block and a lab block are two meetings of the same crn.
create table "schedule_builder"."meetings" (
  "id"             serial primary key,
  "monday"         boolean default false not null,
  "tuesday"        boolean default false not null,
  "wednesday"      boolean default false not null,
  "thursday"       boolean default false not null,
  "friday"         boolean default false not null,
  "saturday"       boolean default false not null,
  "sunday"         boolean default false not null,
  "startDate"      date,
  "endDate"        date,
  "startTime"      time,
  "endTime"        time,
  -- Defaults to 'TBA' so a section published before its room is assigned is a
  -- valid row, with buildingId and room left null.
  "locationStatus" "schedule_builder"."locationStatus" default 'TBA'::"schedule_builder"."locationStatus" not null,
  "buildingId"     integer,
  "room"           varchar,
  "offeringCrn"    integer not null
);

-- User tables
--
-- These four hold member data rather than scraped data, and they are the only
-- tables in the schema a client ever writes.
--
-- None of the `userId` columns references auth.users. That is the current
-- shape, not an oversight to fix: adding the FK would make deleting an account
-- cascade or fail here, and would create a cross-schema dependency this schema
-- does not have today.

-- The plan being edited right now, one row per user per term.
create table "schedule_builder"."userPlanDrafts" (
  "userId"             uuid,
  "academicPeriod"     integer,
  "prefStartTime"      time,
  "prefEndTime"        time,
  "inputCampus"        varchar,
  "gapDay"             varchar,
  "minCreditHours"     integer default 12 not null,
  "maxCreditHours"     integer default 18 not null,
  "walking"            boolean default false not null,
  "showFilledClasses"  boolean default false not null,
  constraint "userPlanDrafts_pkey" primary key ("userId", "academicPeriod")
);

-- The courses in a draft. `excludedCrns` is the sections the user ruled out, so
-- the generator can skip them without the user having to drop the course.
create table "schedule_builder"."userPlanDraftCourses" (
  "id"             uuid primary key default gen_random_uuid(),
  "userId"         uuid not null,
  "academicPeriod" integer not null,
  "courseId"       integer not null,
  "excludedCrns"   integer[] default '{}'::integer[] not null,
  constraint "userPlanDraftCourses_userId_academicPeriod_courseId_unique" unique ("userId", "academicPeriod", "courseId")
);

create table "schedule_builder"."userPreferences" (
  "userId"                uuid primary key,
  "currentAcademicPeriod" integer
);

-- A schedule the user kept. `crns` is a plain integer array with no FK, so a
-- saved plan survives a section disappearing from the next scrape.
create table "schedule_builder"."userSavedPlans" (
  "id"             uuid primary key default gen_random_uuid(),
  "userId"         uuid not null,
  "academicPeriod" integer not null,
  "title"          varchar not null,
  "crns"           integer[] not null,
  "pinned"         boolean default false not null,
  "createdAt"      timestamp default now() not null,
  "updatedAt"      timestamp default now() not null
);

-- Indexes and foreign keys
--
-- The FKs are added after every table exists so the file does not have to be
-- ordered by dependency. All of them are plain `no action`: a scrape replaces
-- rows in dependency order, and a cascade here would let a bad catalog fetch
-- delete sections.

-- Cross-listed sections are looked up by their shared id when the UI has to
-- show one course under another department's number.
create index "offerings_crossListingId_index" on "schedule_builder"."offerings" ("crossListingId");

alter table "schedule_builder"."courseDetails" add constraint "courseDetails_courseId_courses_id_fkey" foreign key ("courseId") references "schedule_builder"."courses" ("id");
alter table "schedule_builder"."courses" add constraint "courses_collegeId_colleges_id_fkey" foreign key ("collegeId") references "schedule_builder"."colleges" ("id");
alter table "schedule_builder"."courses" add constraint "courses_departmentId_departments_id_fkey" foreign key ("departmentId") references "schedule_builder"."departments" ("id");
alter table "schedule_builder"."courses" add constraint "courses_subjectId_subjects_id_fkey" foreign key ("subjectId") references "schedule_builder"."subjects" ("id");
alter table "schedule_builder"."departments" add constraint "departments_collegeId_colleges_id_fkey" foreign key ("collegeId") references "schedule_builder"."colleges" ("id");
alter table "schedule_builder"."meetings" add constraint "meetings_buildingId_buildings_id_fkey" foreign key ("buildingId") references "schedule_builder"."buildings" ("id");
alter table "schedule_builder"."meetings" add constraint "meetings_offeringCrn_offerings_crn_fkey" foreign key ("offeringCrn") references "schedule_builder"."offerings" ("crn");
alter table "schedule_builder"."offerings" add constraint "offerings_academicPeriod_terms_academicPeriod_fkey" foreign key ("academicPeriod") references "schedule_builder"."terms" ("academicPeriod");
alter table "schedule_builder"."offerings" add constraint "offerings_courseId_courses_id_fkey" foreign key ("courseId") references "schedule_builder"."courses" ("id");
alter table "schedule_builder"."offerings" add constraint "offerings_instructorId_instructors_id_fkey" foreign key ("instructorId") references "schedule_builder"."instructors" ("id");
alter table "schedule_builder"."offerings" add constraint "offerings_scheduleTypeId_scheduleTypes_id_fkey" foreign key ("scheduleTypeId") references "schedule_builder"."scheduleTypes" ("id");
alter table "schedule_builder"."offerings" add constraint "offerings_campusId_campuses_id_fkey" foreign key ("campusId") references "schedule_builder"."campuses" ("id");
alter table "schedule_builder"."partsOfTerm" add constraint "partsOfTerm_academicPeriod_terms_academicPeriod_fkey" foreign key ("academicPeriod") references "schedule_builder"."terms" ("academicPeriod");
alter table "schedule_builder"."userPlanDraftCourses" add constraint "userPlanDraftCourses_courseId_courses_id_fkey" foreign key ("courseId") references "schedule_builder"."courses" ("id");

-- The terms that actually have sections loaded. `terms` gets rows as soon as
-- the term list is scraped, but a term with no offerings yet is not something
-- the user can plan, so the term picker reads this instead of the table.
--
-- A plain view with no `security_invoker`, so it runs with the owner's rights
-- and bypasses RLS on terms and offerings. That is harmless today because both
-- are world-readable anyway, but turning security_invoker on changes whose
-- policies apply. It is a behavior change, not a tidy-up.
create view "schedule_builder"."availableTerms" as (
  select
    "schedule_builder"."terms"."academicPeriod",
    "schedule_builder"."terms"."description"
  from "schedule_builder"."terms"
  inner join "schedule_builder"."offerings"
    on "schedule_builder"."offerings"."academicPeriod" = "schedule_builder"."terms"."academicPeriod"
  group by "schedule_builder"."terms"."academicPeriod", "schedule_builder"."terms"."description"
  order by "schedule_builder"."terms"."academicPeriod" desc
);

-- One flat, pre-joined row per section for the course search, with a tsvector
-- over the text a student types: course title, subject abbreviation, course
-- number, and both halves of the instructor's name.
--
-- Two things about it. It is created with no indexes at all, on purpose: the
-- scrape cron runs `create unique index if not exists "offeringSearch_crn_idx"`
-- and the GIN `"offeringSearch_fts_idx"` before every refresh, and the unique
-- one is what makes `refresh materialized view concurrently` legal. Until the
-- first scrape the view is empty and unindexed, which is correct.
--
-- And RLS does not apply to materialized views, so the schema's default
-- privileges hand anon `all` on this one with no policy able to narrow it.
-- Every column here is already public through the catalog tables, so that is
-- fine, but it means a column added to this body is published outright.
create materialized view "schedule_builder"."offeringSearch" as (
  select
    "schedule_builder"."offerings"."crn",
    "schedule_builder"."offerings"."academicPeriod",
    "schedule_builder"."offerings"."seatsAvailable",
    "schedule_builder"."offerings"."active",
    "schedule_builder"."courses"."id" as "courseId",
    "schedule_builder"."courses"."abbr",
    "schedule_builder"."courses"."courseNumber",
    "schedule_builder"."courses"."title",
    "schedule_builder"."courses"."maxCreditHours",
    "schedule_builder"."instructors"."id" as "instructorId",
    "schedule_builder"."instructors"."firstName",
    "schedule_builder"."instructors"."lastName",
    to_tsvector('english',
        coalesce("schedule_builder"."courses"."title", '') || ' ' ||
        coalesce("schedule_builder"."courses"."abbr", '') || ' ' ||
        coalesce("schedule_builder"."courses"."courseNumber", '') || ' ' ||
        coalesce("schedule_builder"."instructors"."lastName", '') || ' ' ||
        coalesce("schedule_builder"."instructors"."firstName", '')
      ) as "search_vector"
  from "schedule_builder"."offerings"
  inner join "schedule_builder"."courses"
    on "schedule_builder"."courses"."id" = "schedule_builder"."offerings"."courseId"
  left join "schedule_builder"."instructors"
    on "schedule_builder"."instructors"."id" = "schedule_builder"."offerings"."instructorId"
);

-- Row level security
--
-- Two shapes, and the difference is the security model.
--
-- The thirteen catalog tables get RLS plus a SELECT-only "public_read" policy.
-- anon and authenticated already hold `all` on them from the schema's default
-- privileges, so RLS is the only thing standing between a PostgREST client and
-- writing the course catalog. Drop RLS on one of these and it does not become
-- read-only, it becomes world-writable. The scrapers are unaffected because
-- they connect as postgres over DB_URL and bypass RLS.
--
-- The four user tables get RLS plus one FOR ALL policy scoped to
-- `authenticated` and keyed on auth.uid(). anon holds table privileges but
-- matches no policy at all, so it reads no rows and writes none.
--
-- These statements were a `do $$ ... foreach ... end $$` loop over a table-name
-- array. They are expanded so that grepping for a table name finds its policy,
-- and because the loop enabled RLS on `terms` a second time after an earlier
-- standalone statement had already done it. Each table is enabled exactly once
-- here. "public_read" is the same name on thirteen tables, which is legal
-- because policy names are per-table: a pass that deduplicates by name deletes
-- twelve live policies.

alter table "schedule_builder"."subjects" enable row level security;
create policy "public_read" on "schedule_builder"."subjects" for select to anon, authenticated using (true);

alter table "schedule_builder"."colleges" enable row level security;
create policy "public_read" on "schedule_builder"."colleges" for select to anon, authenticated using (true);

alter table "schedule_builder"."departments" enable row level security;
create policy "public_read" on "schedule_builder"."departments" for select to anon, authenticated using (true);

alter table "schedule_builder"."buildings" enable row level security;
create policy "public_read" on "schedule_builder"."buildings" for select to anon, authenticated using (true);

alter table "schedule_builder"."campuses" enable row level security;
create policy "public_read" on "schedule_builder"."campuses" for select to anon, authenticated using (true);

alter table "schedule_builder"."scheduleTypes" enable row level security;
create policy "public_read" on "schedule_builder"."scheduleTypes" for select to anon, authenticated using (true);

alter table "schedule_builder"."partsOfTerm" enable row level security;
create policy "public_read" on "schedule_builder"."partsOfTerm" for select to anon, authenticated using (true);

alter table "schedule_builder"."instructors" enable row level security;
create policy "public_read" on "schedule_builder"."instructors" for select to anon, authenticated using (true);

alter table "schedule_builder"."courses" enable row level security;
create policy "public_read" on "schedule_builder"."courses" for select to anon, authenticated using (true);

alter table "schedule_builder"."courseDetails" enable row level security;
create policy "public_read" on "schedule_builder"."courseDetails" for select to anon, authenticated using (true);

alter table "schedule_builder"."offerings" enable row level security;
create policy "public_read" on "schedule_builder"."offerings" for select to anon, authenticated using (true);

alter table "schedule_builder"."meetings" enable row level security;
create policy "public_read" on "schedule_builder"."meetings" for select to anon, authenticated using (true);

alter table "schedule_builder"."terms" enable row level security;
create policy "public_read" on "schedule_builder"."terms" for select to anon, authenticated using (true);

-- The user tables. USING and WITH CHECK carry the same predicate on all four,
-- so a client can neither read nor write another member's plan.
alter table "schedule_builder"."userPlanDraftCourses" enable row level security;
create policy "users_own_draft_courses" on "schedule_builder"."userPlanDraftCourses"
  as permissive for all to "authenticated"
  using (auth.uid() = "schedule_builder"."userPlanDraftCourses"."userId")
  with check (auth.uid() = "schedule_builder"."userPlanDraftCourses"."userId");

alter table "schedule_builder"."userPlanDrafts" enable row level security;
create policy "users_own_drafts" on "schedule_builder"."userPlanDrafts"
  as permissive for all to "authenticated"
  using (auth.uid() = "schedule_builder"."userPlanDrafts"."userId")
  with check (auth.uid() = "schedule_builder"."userPlanDrafts"."userId");

alter table "schedule_builder"."userPreferences" enable row level security;
create policy "users_own_prefs" on "schedule_builder"."userPreferences"
  as permissive for all to "authenticated"
  using (auth.uid() = "schedule_builder"."userPreferences"."userId")
  with check (auth.uid() = "schedule_builder"."userPreferences"."userId");

alter table "schedule_builder"."userSavedPlans" enable row level security;
create policy "users_own_plans" on "schedule_builder"."userSavedPlans"
  as permissive for all to "authenticated"
  using (auth.uid() = "schedule_builder"."userSavedPlans"."userId")
  with check (auth.uid() = "schedule_builder"."userSavedPlans"."userId");
