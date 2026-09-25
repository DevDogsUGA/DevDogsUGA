// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { fetchCoursesBySubject } from "./useCoursesBySubject";
import { fetchCoursesByInstructor } from "./useCoursesByInstructor";

/**
 * Test suite for fetchCoursesBySubject and fetchCoursesByInstructor
 * to ensure they filter out courses with all cancelled offerings.
 */

const ACADEMIC_PERIOD = 900002;
const PART_OF_TERM_CODE = "DBTEST2";
const CANCELLED_CRN = 9000011;
const ACTIVE_CRN = 9000012;

const NAMES = {
  college: "DB Test College (course-query-test)",
  subjectAbbr: "DBT2",
  courseAbbrAllCancelled: "DBTEST-201 (all-cancelled)",
  courseAbbrPartialCancelled: "DBTEST-202 (partial-cancelled)",
  instructorFirstName: "TestInstructor",
  instructorLastName: "DbTest",
  scheduleTypeAbbr: "DBT2",
  campusAbbr: "DBT2",
};

type Row = {
  id: number;
};

async function cleanup() {
  await db.execute(
    sql`delete from schedule_builder.offerings where crn in (${CANCELLED_CRN}, ${ACTIVE_CRN})`,
  );
  await db.execute(
    sql`delete from schedule_builder.courses where abbr like 'DBTEST-20%'`,
  );
  await db.execute(
    sql`delete from schedule_builder.subjects where abbr = ${NAMES.subjectAbbr}`,
  );
  await db.execute(
    sql`delete from schedule_builder.colleges where description = ${NAMES.college}`,
  );
  await db.execute(
    sql`delete from schedule_builder."partsOfTerm" where "academicPeriod" = ${ACADEMIC_PERIOD}`,
  );
  await db.execute(
    sql`delete from schedule_builder.terms where "academicPeriod" = ${ACADEMIC_PERIOD}`,
  );
  await db.execute(
    sql`delete from schedule_builder."scheduleTypes" where abbr = ${NAMES.scheduleTypeAbbr}`,
  );
  await db.execute(
    sql`delete from schedule_builder.campuses where abbr = ${NAMES.campusAbbr}`,
  );
  await db.execute(
    sql`delete from schedule_builder.instructors where "firstName" = ${NAMES.instructorFirstName} and "lastName" = ${NAMES.instructorLastName}`,
  );
}

let collegeId: number;
let subjectId: number;
let courseIdAllCancelled: number;
let courseIdPartialCancelled: number;
let scheduleTypeId: number;
let campusId: number;
let instructorId: number;

async function seed() {
  await db.execute(sql`
    insert into schedule_builder.terms ("academicPeriod", description)
    values (${ACADEMIC_PERIOD}, 'DB Test Term 2')
  `);
  await db.execute(sql`
    insert into schedule_builder."partsOfTerm"
      ("academicPeriod", code, description, "classesBegin", "dropAddEnds",
       "censusDate", "withdrawalDeadline", "classesEnd")
    values (${ACADEMIC_PERIOD}, ${PART_OF_TERM_CODE}, 'DB Test Part of Term 2',
            '2026-01-01', '2026-01-08', '2026-01-15', '2026-04-01', '2026-05-01')
  `);

  const [college] = await db.execute<Row>(sql`
    insert into schedule_builder.colleges (description)
    values (${NAMES.college}) returning id
  `);
  collegeId = college!.id;

  const [subject] = await db.execute<Row>(sql`
    insert into schedule_builder.subjects (abbr, description)
    values (${NAMES.subjectAbbr}, 'DB Test Subject') returning id
  `);
  subjectId = subject!.id;

  const [courseAllCancelled] = await db.execute<Row>(sql`
    insert into schedule_builder.courses
      (abbr, title, "abbrTitle", "courseNumber", "minCreditHours",
       "maxCreditHours", "minBillingCreditHours", "collegeId", "subjectId")
    values (${NAMES.courseAbbrAllCancelled}, 'All Cancelled Course', 'All Cancelled Course', '201',
            3, 3, 3, ${collegeId}, ${subjectId})
    returning id
  `);
  courseIdAllCancelled = courseAllCancelled!.id;

  const [coursePartialCancelled] = await db.execute<Row>(sql`
    insert into schedule_builder.courses
      (abbr, title, "abbrTitle", "courseNumber", "minCreditHours",
       "maxCreditHours", "minBillingCreditHours", "collegeId", "subjectId")
    values (${NAMES.courseAbbrPartialCancelled}, 'Partial Cancelled Course', 'Partial Cancelled Course', '202',
            3, 3, 3, ${collegeId}, ${subjectId})
    returning id
  `);
  courseIdPartialCancelled = coursePartialCancelled!.id;

  const [scheduleType] = await db.execute<Row>(sql`
    insert into schedule_builder."scheduleTypes" (abbr, description)
    values (${NAMES.scheduleTypeAbbr}, 'DB Test Schedule Type') returning id
  `);
  scheduleTypeId = scheduleType!.id;

  const [campus] = await db.execute<Row>(sql`
    insert into schedule_builder.campuses (abbr, description)
    values (${NAMES.campusAbbr}, 'DB Test Campus') returning id
  `);
  campusId = campus!.id;

  const [instructor] = await db.execute<Row>(sql`
    insert into schedule_builder.instructors ("firstName", "lastName")
    values (${NAMES.instructorFirstName}, ${NAMES.instructorLastName}) returning id
  `);
  instructorId = instructor!.id;

  // Create a cancelled offering for the first course
  await db.execute(sql`
    insert into schedule_builder.offerings
      (crn, "minimumEnrollment", "maximumEnrollment", "actualEnrollment",
       "seatsAvailable", cancelled, "academicPeriod", "partOfTerm", "courseId",
       "instructorId", "scheduleTypeId", "campusId")
    values (${CANCELLED_CRN}, 0, 30, 10, 20, true, ${ACADEMIC_PERIOD},
            ${PART_OF_TERM_CODE}, ${courseIdAllCancelled}, ${instructorId}, ${scheduleTypeId}, ${campusId})
  `);

  // Create an active offering for the second course
  await db.execute(sql`
    insert into schedule_builder.offerings
      (crn, "minimumEnrollment", "maximumEnrollment", "actualEnrollment",
       "seatsAvailable", cancelled, "academicPeriod", "partOfTerm", "courseId",
       "instructorId", "scheduleTypeId", "campusId")
    values (${ACTIVE_CRN}, 0, 30, 10, 20, false, ${ACADEMIC_PERIOD},
            ${PART_OF_TERM_CODE}, ${courseIdPartialCancelled}, ${instructorId}, ${scheduleTypeId}, ${campusId})
  `);
}

beforeAll(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

describe("cancelled offerings", () => {
  it("fetchCoursesBySubject hides a course whose only offering is cancelled", async () => {
    const abbrs = (await fetchCoursesBySubject(subjectId, ACADEMIC_PERIOD)).map(
      (c) => c.abbr,
    );
    expect(abbrs).toContain(NAMES.courseAbbrPartialCancelled);
    expect(abbrs).not.toContain(NAMES.courseAbbrAllCancelled);
  });

  it("fetchCoursesByInstructor hides a course whose only offering is cancelled", async () => {
    const abbrs = (
      await fetchCoursesByInstructor(instructorId, ACADEMIC_PERIOD)
    ).map((c) => c.abbr);
    expect(abbrs).toContain(NAMES.courseAbbrPartialCancelled);
    expect(abbrs).not.toContain(NAMES.courseAbbrAllCancelled);
  });
});
