-- Schedule Builder app schema. Owns the `schedule_builder` Postgres schema.
-- USAGE + default privileges for the PostgREST roles (Supabase only
-- pre-configures these for public). Isolation is via RLS, not the schema.

create schema if not exists schedule_builder;

grant usage on schema schedule_builder to anon, authenticated, service_role;

alter default privileges in schema schedule_builder
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema schedule_builder
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema schedule_builder
  grant all on functions to anon, authenticated, service_role;

CREATE TYPE "schedule_builder"."locationStatus" AS ENUM('TBA', 'NCRR', 'RESERVED');
CREATE TABLE "schedule_builder"."buildings" (
	"id" integer PRIMARY KEY,
	"description" varchar NOT NULL,
	"address" varchar,
	"latitude" double precision,
	"longitude" double precision
);

CREATE TABLE "schedule_builder"."campuses" (
	"id" serial PRIMARY KEY,
	"abbr" varchar NOT NULL UNIQUE,
	"description" varchar NOT NULL
);

CREATE TABLE "schedule_builder"."colleges" (
	"id" serial PRIMARY KEY,
	"description" varchar NOT NULL UNIQUE
);

CREATE TABLE "schedule_builder"."courseDetails" (
	"id" serial PRIMARY KEY,
	"description" text,
	"gradingSystem" varchar,
	"semesterOffered" varchar,
	"corequisite" text,
	"equivalentCourses" text,
	"lastFetched" timestamp NOT NULL,
	"courseId" integer NOT NULL,
	"prerequisites" jsonb
);

CREATE TABLE "schedule_builder"."courses" (
	"id" serial PRIMARY KEY,
	"abbr" varchar NOT NULL UNIQUE,
	"title" varchar NOT NULL,
	"abbrTitle" varchar NOT NULL,
	"courseNumber" varchar NOT NULL,
	"minCreditHours" real NOT NULL,
	"maxCreditHours" real NOT NULL,
	"minBillingCreditHours" real NOT NULL,
	"honors" boolean DEFAULT false NOT NULL,
	"collegeId" integer NOT NULL,
	"departmentId" integer,
	"subjectId" integer NOT NULL,
	CONSTRAINT "unique_subject_courseNumber" UNIQUE("subjectId","courseNumber")
);

CREATE TABLE "schedule_builder"."departments" (
	"id" serial PRIMARY KEY,
	"description" varchar NOT NULL UNIQUE,
	"collegeId" integer NOT NULL
);

CREATE TABLE "schedule_builder"."instructors" (
	"id" serial PRIMARY KEY,
	"firstName" varchar NOT NULL,
	"lastName" varchar NOT NULL,
	"totalReviews" integer DEFAULT 0 NOT NULL,
	"averageRating" real DEFAULT 0 NOT NULL,
	"difficultyRating" real DEFAULT 0 NOT NULL,
	"wouldTakeAgainRating" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "unique_full_name" UNIQUE("firstName","lastName")
);

CREATE TABLE "schedule_builder"."meetings" (
	"id" serial PRIMARY KEY,
	"monday" boolean DEFAULT false NOT NULL,
	"tuesday" boolean DEFAULT false NOT NULL,
	"wednesday" boolean DEFAULT false NOT NULL,
	"thursday" boolean DEFAULT false NOT NULL,
	"friday" boolean DEFAULT false NOT NULL,
	"saturday" boolean DEFAULT false NOT NULL,
	"sunday" boolean DEFAULT false NOT NULL,
	"startDate" date,
	"endDate" date,
	"startTime" time,
	"endTime" time,
	"locationStatus" "schedule_builder"."locationStatus" DEFAULT 'TBA'::"schedule_builder"."locationStatus" NOT NULL,
	"buildingId" integer,
	"room" varchar,
	"offeringCrn" integer NOT NULL
);

CREATE TABLE "schedule_builder"."offerings" (
	"crn" integer PRIMARY KEY,
	"crossListingId" varchar,
	"minimumEnrollment" integer DEFAULT 0 NOT NULL,
	"maximumEnrollment" integer NOT NULL,
	"actualEnrollment" integer NOT NULL,
	"seatsAvailable" integer NOT NULL,
	"active" boolean NOT NULL,
	"academicPeriod" integer NOT NULL,
	"partOfTerm" varchar NOT NULL,
	"courseId" integer NOT NULL,
	"instructorId" integer,
	"scheduleTypeId" integer NOT NULL,
	"campusId" integer NOT NULL
);

CREATE TABLE "schedule_builder"."partsOfTerm" (
	"academicPeriod" integer,
	"code" varchar,
	"description" varchar NOT NULL,
	"classesBegin" date NOT NULL,
	"dropAddEnds" date NOT NULL,
	"censusDate" date NOT NULL,
	"withdrawalDeadline" date NOT NULL,
	"classesEnd" date NOT NULL,
	"finalsEnd" date,
	CONSTRAINT "partsOfTerm_pkey" PRIMARY KEY("academicPeriod","code")
);

CREATE TABLE "schedule_builder"."scheduleTypes" (
	"id" serial PRIMARY KEY,
	"abbr" varchar NOT NULL UNIQUE,
	"description" varchar NOT NULL
);

CREATE TABLE "schedule_builder"."subjects" (
	"id" serial PRIMARY KEY,
	"abbr" varchar(4) NOT NULL UNIQUE,
	"description" varchar NOT NULL
);

CREATE TABLE "schedule_builder"."terms" (
	"academicPeriod" integer PRIMARY KEY,
	"description" varchar NOT NULL
);

ALTER TABLE "schedule_builder"."terms" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "schedule_builder"."userPlanDraftCourses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"academicPeriod" integer NOT NULL,
	"courseId" integer NOT NULL,
	"excludedCrns" integer[] DEFAULT '{}'::integer[] NOT NULL,
	CONSTRAINT "userPlanDraftCourses_userId_academicPeriod_courseId_unique" UNIQUE("userId","academicPeriod","courseId")
);

ALTER TABLE "schedule_builder"."userPlanDraftCourses" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "schedule_builder"."userPlanDrafts" (
	"userId" uuid,
	"academicPeriod" integer,
	"prefStartTime" time,
	"prefEndTime" time,
	"inputCampus" varchar,
	"gapDay" varchar,
	"minCreditHours" integer DEFAULT 12 NOT NULL,
	"maxCreditHours" integer DEFAULT 18 NOT NULL,
	"walking" boolean DEFAULT false NOT NULL,
	"showFilledClasses" boolean DEFAULT false NOT NULL,
	CONSTRAINT "userPlanDrafts_pkey" PRIMARY KEY("userId","academicPeriod")
);

ALTER TABLE "schedule_builder"."userPlanDrafts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "schedule_builder"."userPreferences" (
	"userId" uuid PRIMARY KEY,
	"currentAcademicPeriod" integer
);

ALTER TABLE "schedule_builder"."userPreferences" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "schedule_builder"."userSavedPlans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"academicPeriod" integer NOT NULL,
	"title" varchar NOT NULL,
	"crns" integer[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "schedule_builder"."userSavedPlans" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "offerings_crossListingId_index" ON "schedule_builder"."offerings" ("crossListingId");
ALTER TABLE "schedule_builder"."courseDetails" ADD CONSTRAINT "courseDetails_courseId_courses_id_fkey" FOREIGN KEY ("courseId") REFERENCES "schedule_builder"."courses"("id");
ALTER TABLE "schedule_builder"."courses" ADD CONSTRAINT "courses_collegeId_colleges_id_fkey" FOREIGN KEY ("collegeId") REFERENCES "schedule_builder"."colleges"("id");
ALTER TABLE "schedule_builder"."courses" ADD CONSTRAINT "courses_departmentId_departments_id_fkey" FOREIGN KEY ("departmentId") REFERENCES "schedule_builder"."departments"("id");
ALTER TABLE "schedule_builder"."courses" ADD CONSTRAINT "courses_subjectId_subjects_id_fkey" FOREIGN KEY ("subjectId") REFERENCES "schedule_builder"."subjects"("id");
ALTER TABLE "schedule_builder"."departments" ADD CONSTRAINT "departments_collegeId_colleges_id_fkey" FOREIGN KEY ("collegeId") REFERENCES "schedule_builder"."colleges"("id");
ALTER TABLE "schedule_builder"."meetings" ADD CONSTRAINT "meetings_buildingId_buildings_id_fkey" FOREIGN KEY ("buildingId") REFERENCES "schedule_builder"."buildings"("id");
ALTER TABLE "schedule_builder"."meetings" ADD CONSTRAINT "meetings_offeringCrn_offerings_crn_fkey" FOREIGN KEY ("offeringCrn") REFERENCES "schedule_builder"."offerings"("crn");
ALTER TABLE "schedule_builder"."offerings" ADD CONSTRAINT "offerings_academicPeriod_terms_academicPeriod_fkey" FOREIGN KEY ("academicPeriod") REFERENCES "schedule_builder"."terms"("academicPeriod");
ALTER TABLE "schedule_builder"."offerings" ADD CONSTRAINT "offerings_courseId_courses_id_fkey" FOREIGN KEY ("courseId") REFERENCES "schedule_builder"."courses"("id");
ALTER TABLE "schedule_builder"."offerings" ADD CONSTRAINT "offerings_instructorId_instructors_id_fkey" FOREIGN KEY ("instructorId") REFERENCES "schedule_builder"."instructors"("id");
ALTER TABLE "schedule_builder"."offerings" ADD CONSTRAINT "offerings_scheduleTypeId_scheduleTypes_id_fkey" FOREIGN KEY ("scheduleTypeId") REFERENCES "schedule_builder"."scheduleTypes"("id");
ALTER TABLE "schedule_builder"."offerings" ADD CONSTRAINT "offerings_campusId_campuses_id_fkey" FOREIGN KEY ("campusId") REFERENCES "schedule_builder"."campuses"("id");
ALTER TABLE "schedule_builder"."partsOfTerm" ADD CONSTRAINT "partsOfTerm_academicPeriod_terms_academicPeriod_fkey" FOREIGN KEY ("academicPeriod") REFERENCES "schedule_builder"."terms"("academicPeriod");
ALTER TABLE "schedule_builder"."userPlanDraftCourses" ADD CONSTRAINT "userPlanDraftCourses_courseId_courses_id_fkey" FOREIGN KEY ("courseId") REFERENCES "schedule_builder"."courses"("id");
CREATE VIEW "schedule_builder"."availableTerms" AS (select "schedule_builder"."terms"."academicPeriod", "schedule_builder"."terms"."description" from "schedule_builder"."terms" inner join "schedule_builder"."offerings" on "schedule_builder"."offerings"."academicPeriod" = "schedule_builder"."terms"."academicPeriod" group by "schedule_builder"."terms"."academicPeriod", "schedule_builder"."terms"."description" order by "schedule_builder"."terms"."academicPeriod" desc);
CREATE MATERIALIZED VIEW "schedule_builder"."offeringSearch" AS (select "schedule_builder"."offerings"."crn", "schedule_builder"."offerings"."academicPeriod", "schedule_builder"."offerings"."seatsAvailable", "schedule_builder"."offerings"."active", "schedule_builder"."courses"."id" as "courseId", "schedule_builder"."courses"."abbr", "schedule_builder"."courses"."courseNumber", "schedule_builder"."courses"."title", "schedule_builder"."courses"."maxCreditHours", "schedule_builder"."instructors"."id" as "instructorId", "schedule_builder"."instructors"."firstName", "schedule_builder"."instructors"."lastName", to_tsvector('english',
        coalesce("schedule_builder"."courses"."title", '') || ' ' ||
        coalesce("schedule_builder"."courses"."abbr", '') || ' ' ||
        coalesce("schedule_builder"."courses"."courseNumber", '') || ' ' ||
        coalesce("schedule_builder"."instructors"."lastName", '') || ' ' ||
        coalesce("schedule_builder"."instructors"."firstName", '')
      ) as "search_vector" from "schedule_builder"."offerings" inner join "schedule_builder"."courses" on "schedule_builder"."courses"."id" = "schedule_builder"."offerings"."courseId" left join "schedule_builder"."instructors" on "schedule_builder"."instructors"."id" = "schedule_builder"."offerings"."instructorId");
CREATE POLICY "users_own_draft_courses" ON "schedule_builder"."userPlanDraftCourses" AS PERMISSIVE FOR ALL TO "authenticated" USING (auth.uid() = "schedule_builder"."userPlanDraftCourses"."userId") WITH CHECK (auth.uid() = "schedule_builder"."userPlanDraftCourses"."userId");
CREATE POLICY "users_own_drafts" ON "schedule_builder"."userPlanDrafts" AS PERMISSIVE FOR ALL TO "authenticated" USING (auth.uid() = "schedule_builder"."userPlanDrafts"."userId") WITH CHECK (auth.uid() = "schedule_builder"."userPlanDrafts"."userId");
CREATE POLICY "users_own_prefs" ON "schedule_builder"."userPreferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (auth.uid() = "schedule_builder"."userPreferences"."userId") WITH CHECK (auth.uid() = "schedule_builder"."userPreferences"."userId");
CREATE POLICY "users_own_plans" ON "schedule_builder"."userSavedPlans" AS PERMISSIVE FOR ALL TO "authenticated" USING (auth.uid() = "schedule_builder"."userSavedPlans"."userId") WITH CHECK (auth.uid() = "schedule_builder"."userSavedPlans"."userId");
-- Catalog / reference tables are world-readable; writes happen only through the
-- postgres DB_URL connection (scrapers), which bypasses RLS. Enabling RLS with
-- a public-read policy prevents anon/authenticated from writing them via
-- PostgREST under the schema's default grants.
do $$
declare t text;
begin
  foreach t in array array[
    'subjects','colleges','departments','buildings','campuses','scheduleTypes',
    'partsOfTerm','instructors','courses','courseDetails','offerings','meetings','terms'
  ] loop
    execute format('alter table %I.%I enable row level security', 'schedule_builder', t);
    execute format(
      'create policy "public_read" on %I.%I for select to anon, authenticated using (true)',
      'schedule_builder', t
    );
  end loop;
end $$;
