import { index, pgSchema, primaryKey, unique } from "drizzle-orm/pg-core";
import { desc, eq, sql } from "drizzle-orm";
import { crudPolicy } from "../policy";

// This app owns the `schedule_builder` Postgres schema.
const scheduleBuilder = pgSchema("schedule_builder");

// ─── Lookup tables ────────────────────────────────────────────────────────────

export const subjects = scheduleBuilder.table("subjects", (d) => ({
  id: d.serial().primaryKey(),
  abbr: d.varchar({ length: 4 }).unique().notNull(),
  description: d.varchar().notNull(),
}));

export const colleges = scheduleBuilder.table("colleges", (d) => ({
  id: d.serial().primaryKey(),
  description: d.varchar().unique().notNull(),
}));

export const departments = scheduleBuilder.table("departments", (d) => ({
  id: d.serial().primaryKey(),
  description: d.varchar().unique().notNull(),
  collegeId: d
    .integer()
    .notNull()
    .references(() => colleges.id),
}));

export const buildings = scheduleBuilder.table("buildings", (d) => ({
  id: d.integer().primaryKey(),
  description: d.varchar().notNull(),
  address: d.varchar(),
  latitude: d.doublePrecision(),
  longitude: d.doublePrecision(),
}));

export const campuses = scheduleBuilder.table("campuses", (d) => ({
  id: d.serial().primaryKey(),
  abbr: d.varchar().unique().notNull(),
  description: d.varchar().notNull(),
}));

export const scheduleTypes = scheduleBuilder.table("scheduleTypes", (d) => ({
  id: d.serial().primaryKey(),
  abbr: d.varchar().unique().notNull(),
  description: d.varchar().notNull(),
}));

export const terms = scheduleBuilder.table.withRLS("terms", (d) => ({
  academicPeriod: d.integer().primaryKey(),
  description: d.varchar().notNull(), // e.g. "Fall 2026"
}));

export const partsOfTerm = scheduleBuilder.table(
  "partsOfTerm",
  (d) => ({
    academicPeriod: d
      .integer()
      .notNull()
      .references(() => terms.academicPeriod),
    code: d.varchar().notNull(),
    description: d.varchar().notNull(),
    classesBegin: d.date().notNull(),
    dropAddEnds: d.date().notNull(),
    censusDate: d.date().notNull(),
    withdrawalDeadline: d.date().notNull(),
    classesEnd: d.date().notNull(),
    finalsEnd: d.date(),
  }),
  (t) => [primaryKey({ columns: [t.academicPeriod, t.code] })],
);

export const instructors = scheduleBuilder.table(
  "instructors",
  (d) => ({
    id: d.serial().primaryKey(),
    firstName: d.varchar().notNull(),
    lastName: d.varchar().notNull(),
    totalReviews: d.integer().notNull().default(0),
    averageRating: d.real().notNull().default(0),
    difficultyRating: d.real().notNull().default(0),
    wouldTakeAgainRating: d.integer().notNull().default(0),
  }),
  (t) => [unique("unique_full_name").on(t.firstName, t.lastName)],
);

// ─── Course ───────────────────────────────────────────────────────────────────

export const courses = scheduleBuilder.table(
  "courses",
  (d) => ({
    id: d.serial().primaryKey(),
    abbr: d.varchar().notNull().unique(),
    title: d.varchar().notNull(),
    abbrTitle: d.varchar().notNull(),
    courseNumber: d.varchar().notNull(),
    minCreditHours: d.real().notNull(),
    maxCreditHours: d.real().notNull(),
    minBillingCreditHours: d.real().notNull(),
    honors: d.boolean().notNull().default(false),
    collegeId: d
      .integer()
      .notNull()
      .references(() => colleges.id),
    departmentId: d.integer().references(() => departments.id),
    subjectId: d
      .integer()
      .notNull()
      .references(() => subjects.id),
  }),
  (t) => [
    unique("unique_subject_courseNumber").on(t.subjectId, t.courseNumber),
  ],
);

export const courseDetails = scheduleBuilder.table("courseDetails", (d) => ({
  id: d.serial().primaryKey(),
  description: d.text(),
  gradingSystem: d.varchar(),
  semesterOffered: d.varchar(),
  corequisite: d.text(),
  equivalentCourses: d.text(),
  lastFetched: d.timestamp().notNull(),
  courseId: d
    .integer()
    .notNull()
    .references(() => courses.id),
  prerequisites: d.jsonb().$type<{
    expression: string;
    referencedCourseAbbrs: string[];
  }>(),
}));

// ─── Offering & Meeting ───────────────────────────────────────────────────────

export const offerings = scheduleBuilder.table(
  "offerings",
  (d) => ({
    crn: d.integer().primaryKey(),
    crossListingId: d.varchar(),
    minimumEnrollment: d.integer().notNull().default(0),
    maximumEnrollment: d.integer().notNull(),
    actualEnrollment: d.integer().notNull(),
    seatsAvailable: d.integer().notNull(),
    active: d.boolean().notNull(),
    academicPeriod: d
      .integer()
      .notNull()
      .references(() => terms.academicPeriod),
    partOfTerm: d.varchar().notNull(),
    courseId: d
      .integer()
      .notNull()
      .references(() => courses.id),
    instructorId: d.integer().references(() => instructors.id),
    scheduleTypeId: d
      .integer()
      .notNull()
      .references(() => scheduleTypes.id),
    campusId: d
      .integer()
      .notNull()
      .references(() => campuses.id),
  }),
  (t) => [index().on(t.crossListingId)],
);

export const locationStatusEnum = scheduleBuilder.enum("locationStatus", [
  "TBA",
  "NCRR",
  "RESERVED",
]);

export const meetings = scheduleBuilder.table("meetings", (d) => ({
  id: d.serial().primaryKey(),
  monday: d.boolean().notNull().default(false),
  tuesday: d.boolean().notNull().default(false),
  wednesday: d.boolean().notNull().default(false),
  thursday: d.boolean().notNull().default(false),
  friday: d.boolean().notNull().default(false),
  saturday: d.boolean().notNull().default(false),
  sunday: d.boolean().notNull().default(false),
  startDate: d.date(),
  endDate: d.date(),
  startTime: d.time(),
  endTime: d.time(),
  locationStatus: locationStatusEnum().notNull().default("TBA"),
  buildingId: d.integer().references(() => buildings.id),
  room: d.varchar(),
  offeringCrn: d
    .integer()
    .notNull()
    .references(() => offerings.crn),
}));

// ─── User data ────────────────────────────────────────────────────────────────

export const userPreferences = scheduleBuilder.table(
  "userPreferences",
  (d) => ({
    userId: d.uuid().primaryKey(),
    currentAcademicPeriod: d.integer(),
  }),
  (t) => [crudPolicy("users_own_prefs", t.userId)],
);

export const userPlanDrafts = scheduleBuilder.table(
  "userPlanDrafts",
  (d) => ({
    userId: d.uuid().notNull(),
    academicPeriod: d.integer().notNull(),
    prefStartTime: d.time(),
    prefEndTime: d.time(),
    inputCampus: d.varchar(),
    gapDay: d.varchar(),
    minCreditHours: d.integer().notNull().default(12),
    maxCreditHours: d.integer().notNull().default(18),
    walking: d.boolean().notNull().default(false),
    showFilledClasses: d.boolean().notNull().default(false),
  }),
  (t) => [
    primaryKey({ columns: [t.userId, t.academicPeriod] }),
    crudPolicy("users_own_drafts", t.userId),
  ],
);

export const userPlanDraftCourses = scheduleBuilder.table(
  "userPlanDraftCourses",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d.uuid().notNull(),
    academicPeriod: d.integer().notNull(),
    courseId: d
      .integer()
      .notNull()
      .references(() => courses.id),
    excludedCrns: d.integer().array().notNull().default([]),
  }),
  (t) => [
    unique().on(t.userId, t.academicPeriod, t.courseId),
    crudPolicy("users_own_draft_courses", t.userId),
  ],
);

export const userSavedPlans = scheduleBuilder.table(
  "userSavedPlans",
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom(),
    userId: d.uuid().notNull(),
    academicPeriod: d.integer().notNull(),
    title: d.varchar().notNull(),
    crns: d.integer().array().notNull(),
    pinned: d.boolean().notNull().default(false),
    createdAt: d.timestamp().notNull().defaultNow(),
    updatedAt: d.timestamp().notNull().defaultNow(),
  }),
  (t) => [crudPolicy("users_own_plans", t.userId)],
);

// ─── Academic period selector ─────────────────────────────────────────────────

/**
 * One row per academic period, but only for periods that have at least one
 * offering.
 */
export const availableTerms = scheduleBuilder.view("availableTerms").as((qb) =>
  qb
    .select({
      academicPeriod: terms.academicPeriod,
      description: terms.description,
    })
    .from(terms)
    .innerJoin(offerings, eq(offerings.academicPeriod, terms.academicPeriod))
    .groupBy(terms.academicPeriod, terms.description)
    .orderBy(desc(terms.academicPeriod)),
);

// ─── Full-text search ─────────────────────────────────────────────────────────

export const offeringSearch = scheduleBuilder
  .materializedView("offeringSearch")
  .as((qb) =>
    qb
      .select({
        crn: offerings.crn,
        academicPeriod: offerings.academicPeriod,
        seatsAvailable: offerings.seatsAvailable,
        active: offerings.active,
        courseId: courses.id.as("courseId"),
        abbr: courses.abbr,
        courseNumber: courses.courseNumber,
        title: courses.title,
        maxCreditHours: courses.maxCreditHours,
        instructorId: instructors.id.as("instructorId"),
        firstName: instructors.firstName,
        lastName: instructors.lastName,
        searchVector: sql<string>`to_tsvector('english',
        coalesce(${courses.title}, '') || ' ' ||
        coalesce(${courses.abbr}, '') || ' ' ||
        coalesce(${courses.courseNumber}, '') || ' ' ||
        coalesce(${instructors.lastName}, '') || ' ' ||
        coalesce(${instructors.firstName}, '')
      )`.as("search_vector"),
      })
      .from(offerings)
      .innerJoin(courses, eq(courses.id, offerings.courseId))
      .leftJoin(instructors, eq(instructors.id, offerings.instructorId)),
  );
