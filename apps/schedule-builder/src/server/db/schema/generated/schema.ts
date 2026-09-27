import { pgSchema, pgTable, integer, serial, uuid, varchar, text, boolean, time, date, doublePrecision, real, timestamp, jsonb, pgEnum, index, foreignKey, primaryKey, unique, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const scheduleBuilder = pgSchema("schedule_builder");
export const locationStatusInScheduleBuilder = scheduleBuilder.enum("locationStatus", ["TBA", "NCRR", "RESERVED"])


export const buildingsInScheduleBuilder = scheduleBuilder.table.withRLS("buildings", {
	id: integer().primaryKey(),
	description: varchar().notNull(),
	address: varchar(),
	latitude: doublePrecision(),
	longitude: doublePrecision(),
}, (table) => [

	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const campusesInScheduleBuilder = scheduleBuilder.table.withRLS("campuses", {
	id: serial().primaryKey(),
	abbr: varchar().notNull(),
	description: varchar().notNull(),
}, (table) => [
	unique("campuses_abbr_key").on(table.abbr),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const collegesInScheduleBuilder = scheduleBuilder.table.withRLS("colleges", {
	id: serial().primaryKey(),
	description: varchar().notNull(),
}, (table) => [
	unique("colleges_description_key").on(table.description),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const courseDetailsInScheduleBuilder = scheduleBuilder.table.withRLS("courseDetails", {
	id: serial().primaryKey(),
	description: text(),
	gradingSystem: varchar(),
	semesterOffered: varchar(),
	corequisite: text(),
	equivalentCourses: text(),
	lastFetched: timestamp().notNull(),
	courseId: integer().notNull().references(() => coursesInScheduleBuilder.id),
	prerequisites: jsonb(),
}, (table) => [

	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const coursesInScheduleBuilder = scheduleBuilder.table.withRLS("courses", {
	id: serial().primaryKey(),
	abbr: varchar().notNull(),
	title: varchar().notNull(),
	abbrTitle: varchar().notNull(),
	courseNumber: varchar().notNull(),
	minCreditHours: real().notNull(),
	maxCreditHours: real().notNull(),
	minBillingCreditHours: real().notNull(),
	honors: boolean().default(false).notNull(),
	collegeId: integer().notNull().references(() => collegesInScheduleBuilder.id),
	departmentId: integer().references(() => departmentsInScheduleBuilder.id),
	subjectId: integer().notNull().references(() => subjectsInScheduleBuilder.id),
}, (table) => [
	unique("courses_abbr_key").on(table.abbr),	unique("unique_subject_courseNumber").on(table.subjectId, table.courseNumber),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const departmentsInScheduleBuilder = scheduleBuilder.table.withRLS("departments", {
	id: serial().primaryKey(),
	description: varchar().notNull(),
	collegeId: integer().notNull().references(() => collegesInScheduleBuilder.id),
}, (table) => [
	unique("departments_description_key").on(table.description),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const instructorsInScheduleBuilder = scheduleBuilder.table.withRLS("instructors", {
	id: serial().primaryKey(),
	firstName: varchar().notNull(),
	lastName: varchar().notNull(),
}, (table) => [
	unique("unique_full_name").on(table.firstName, table.lastName),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const meetingsInScheduleBuilder = scheduleBuilder.table.withRLS("meetings", {
	id: serial().primaryKey(),
	monday: boolean().default(false).notNull(),
	tuesday: boolean().default(false).notNull(),
	wednesday: boolean().default(false).notNull(),
	thursday: boolean().default(false).notNull(),
	friday: boolean().default(false).notNull(),
	saturday: boolean().default(false).notNull(),
	sunday: boolean().default(false).notNull(),
	startDate: date(),
	endDate: date(),
	startTime: time(),
	endTime: time(),
	locationStatus: locationStatusInScheduleBuilder().default("TBA").notNull(),
	buildingId: integer().references(() => buildingsInScheduleBuilder.id),
	room: varchar(),
	academicPeriod: integer().notNull(),
	offeringCrn: integer().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.academicPeriod, table.offeringCrn],
		foreignColumns: [offeringsInScheduleBuilder.academicPeriod, offeringsInScheduleBuilder.crn],
		name: "meetings_academicPeriod_offeringCrn_fkey"
	}),
	index("meetings_academicPeriod_offeringCrn_index").using("btree", table.academicPeriod.asc().nullsLast(), table.offeringCrn.asc().nullsLast()),

	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const offeringsInScheduleBuilder = scheduleBuilder.table.withRLS("offerings", {
	crn: integer().notNull(),
	crossListingId: varchar(),
	minimumEnrollment: integer().default(0).notNull(),
	maximumEnrollment: integer().notNull(),
	actualEnrollment: integer().notNull(),
	seatsAvailable: integer().notNull(),
	cancelled: boolean().default(false).notNull(),
	lastSeenAt: timestamp().default(sql`now()`).notNull(),
	academicPeriod: integer().notNull().references(() => termsInScheduleBuilder.academicPeriod),
	partOfTerm: varchar().notNull(),
	courseId: integer().notNull().references(() => coursesInScheduleBuilder.id),
	instructorId: integer().references(() => instructorsInScheduleBuilder.id),
	scheduleTypeId: integer().notNull().references(() => scheduleTypesInScheduleBuilder.id),
	campusId: integer().notNull().references(() => campusesInScheduleBuilder.id),
}, (table) => [
	primaryKey({ columns: [table.academicPeriod, table.crn], name: "offerings_pkey"}),
	foreignKey({
		columns: [table.academicPeriod, table.partOfTerm],
		foreignColumns: [partsOfTermInScheduleBuilder.academicPeriod, partsOfTermInScheduleBuilder.code],
		name: "offerings_academicPeriod_partOfTerm_fkey"
	}),
	index("offerings_academicPeriod_partOfTerm_index").using("btree", table.academicPeriod.asc().nullsLast(), table.partOfTerm.asc().nullsLast()),
	index("offerings_crossListingId_index").using("btree", table.crossListingId.asc().nullsLast()),

	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const partsOfTermInScheduleBuilder = scheduleBuilder.table.withRLS("partsOfTerm", {
	academicPeriod: integer().notNull().references(() => termsInScheduleBuilder.academicPeriod),
	code: varchar().notNull(),
	description: varchar().notNull(),
	classesBegin: date().notNull(),
	dropAddEnds: date().notNull(),
	censusDate: date().notNull(),
	withdrawalDeadline: date().notNull(),
	classesEnd: date().notNull(),
	finalsEnd: date(),
}, (table) => [
	primaryKey({ columns: [table.academicPeriod, table.code], name: "partsOfTerm_pkey"}),

	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const scheduleTypesInScheduleBuilder = scheduleBuilder.table.withRLS("scheduleTypes", {
	id: serial().primaryKey(),
	abbr: varchar().notNull(),
	description: varchar().notNull(),
}, (table) => [
	unique("scheduleTypes_abbr_key").on(table.abbr),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const subjectsInScheduleBuilder = scheduleBuilder.table.withRLS("subjects", {
	id: serial().primaryKey(),
	abbr: varchar({ length: 4 }).notNull(),
	description: varchar().notNull(),
}, (table) => [
	unique("subjects_abbr_key").on(table.abbr),
	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const termsInScheduleBuilder = scheduleBuilder.table.withRLS("terms", {
	academicPeriod: integer().primaryKey(),
	description: varchar().notNull(),
}, (table) => [

	pgPolicy("public_read", { for: "select", to: ["anon", "authenticated"], using: sql`true` }),
]);

export const userPlanDraftCoursesInScheduleBuilder = scheduleBuilder.table.withRLS("userPlanDraftCourses", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull(),
	academicPeriod: integer().notNull(),
	courseId: integer().notNull().references(() => coursesInScheduleBuilder.id),
	excludedCrns: integer().array().default([]).notNull(),
}, (table) => [
	unique("userPlanDraftCourses_userId_academicPeriod_courseId_unique").on(table.userId, table.academicPeriod, table.courseId),
	pgPolicy("users_own_draft_courses", { to: ["authenticated"], using: sql`(auth.uid() = "userId")`, withCheck: sql`(auth.uid() = "userId")` }),
]);

export const userPlanDraftsInScheduleBuilder = scheduleBuilder.table.withRLS("userPlanDrafts", {
	userId: uuid().notNull(),
	academicPeriod: integer().notNull(),
	prefStartTime: time(),
	prefEndTime: time(),
	inputCampus: varchar(),
	minCreditHours: integer().default(12).notNull(),
	maxCreditHours: integer().default(18).notNull(),
	showFilledClasses: boolean().default(false).notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.academicPeriod], name: "userPlanDrafts_pkey"}),

	pgPolicy("users_own_drafts", { to: ["authenticated"], using: sql`(auth.uid() = "userId")`, withCheck: sql`(auth.uid() = "userId")` }),
]);

export const userPreferencesInScheduleBuilder = scheduleBuilder.table.withRLS("userPreferences", {
	userId: uuid().primaryKey(),
	currentAcademicPeriod: integer(),
}, (table) => [

	pgPolicy("users_own_prefs", { to: ["authenticated"], using: sql`(auth.uid() = "userId")`, withCheck: sql`(auth.uid() = "userId")` }),
]);

export const userSavedPlansInScheduleBuilder = scheduleBuilder.table.withRLS("userSavedPlans", {
	id: uuid().defaultRandom().primaryKey(),
	userId: uuid().notNull(),
	academicPeriod: integer().notNull(),
	title: varchar().notNull(),
	crns: integer().array().notNull(),
	pinned: boolean().default(false).notNull(),
	createdAt: timestamp().default(sql`now()`).notNull(),
	updatedAt: timestamp().default(sql`now()`).notNull(),
}, (table) => [

	pgPolicy("users_own_plans", { to: ["authenticated"], using: sql`(auth.uid() = "userId")`, withCheck: sql`(auth.uid() = "userId")` }),
]);
export const availableTermsInScheduleBuilder = scheduleBuilder.view("availableTerms", {	academicPeriod: integer(),
	description: varchar(),
}).as(sql`SELECT terms."academicPeriod", terms.description FROM schedule_builder.terms JOIN schedule_builder.offerings ON offerings."academicPeriod" = terms."academicPeriod" WHERE offerings.cancelled = false GROUP BY terms."academicPeriod", terms.description ORDER BY terms."academicPeriod" DESC`);

// Schema-suffix aliases — appended by devtools db introspect
export { availableTermsInScheduleBuilder as availableTerms };
export { buildingsInScheduleBuilder as buildings };
export { campusesInScheduleBuilder as campuses };
export { collegesInScheduleBuilder as colleges };
export { courseDetailsInScheduleBuilder as courseDetails };
export { coursesInScheduleBuilder as courses };
export { departmentsInScheduleBuilder as departments };
export { instructorsInScheduleBuilder as instructors };
export { locationStatusInScheduleBuilder as locationStatus };
export { meetingsInScheduleBuilder as meetings };
export { offeringsInScheduleBuilder as offerings };
export { partsOfTermInScheduleBuilder as partsOfTerm };
export { scheduleTypesInScheduleBuilder as scheduleTypes };
export { subjectsInScheduleBuilder as subjects };
export { termsInScheduleBuilder as terms };
export { userPlanDraftCoursesInScheduleBuilder as userPlanDraftCourses };
export { userPlanDraftsInScheduleBuilder as userPlanDrafts };
export { userPreferencesInScheduleBuilder as userPreferences };
export { userSavedPlansInScheduleBuilder as userSavedPlans };
