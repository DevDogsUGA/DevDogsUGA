// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { fetchOfferingByCrn } from "./useOfferingByCrn";

/**
 * Test suite for fetchOfferingByCrn to ensure it reports cancelled offerings
 * distinctly from unknown CRNs, rather than surfacing both as `null`.
 */

const ACADEMIC_PERIOD = 900003;
const PART_OF_TERM_CODE = "DBTEST3";
const CANCELLED_CRN = 9000021;
const ACTIVE_CRN = 9000022;
const UNKNOWN_CRN = 9000023;

const NAMES = {
  college: "DB Test College (crn-lookup-test)",
  subjectAbbr: "DBT3",
  courseAbbr: "DBTEST-301",
  instructorFirstName: "TestInstructor",
  instructorLastName: "CrnDbTest",
  scheduleTypeAbbr: "DBT3",
  campusAbbr: "DBT3",
};

type Row = {
  id: number;
};

async function cleanup() {
  await db.execute(
    sql`delete from schedule_builder.offerings where crn in (${CANCELLED_CRN}, ${ACTIVE_CRN})`,
  );
  await db.execute(
    sql`delete from schedule_builder.courses where abbr = ${NAMES.courseAbbr}`,
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

let courseId: number;
let scheduleTypeId: number;
let campusId: number;
let instructorId: number;

async function seed() {
  await db.execute(sql`
    insert into schedule_builder.terms ("academicPeriod", description)
    values (${ACADEMIC_PERIOD}, 'DB Test Term 3')
  `);
  await db.execute(sql`
    insert into schedule_builder."partsOfTerm"
      ("academicPeriod", code, description, "classesBegin", "dropAddEnds",
       "censusDate", "withdrawalDeadline", "classesEnd")
    values (${ACADEMIC_PERIOD}, ${PART_OF_TERM_CODE}, 'DB Test Part of Term 3',
            '2026-01-01', '2026-01-08', '2026-01-15', '2026-04-01', '2026-05-01')
  `);

  const [college] = await db.execute<Row>(sql`
    insert into schedule_builder.colleges (description)
    values (${NAMES.college}) returning id
  `);
  const collegeId = college!.id;

  const [subject] = await db.execute<Row>(sql`
    insert into schedule_builder.subjects (abbr, description)
    values (${NAMES.subjectAbbr}, 'DB Test Subject') returning id
  `);
  const subjectId = subject!.id;

  const [course] = await db.execute<Row>(sql`
    insert into schedule_builder.courses
      (abbr, title, "abbrTitle", "courseNumber", "minCreditHours",
       "maxCreditHours", "minBillingCreditHours", "collegeId", "subjectId")
    values (${NAMES.courseAbbr}, 'CRN Lookup Course', 'CRN Lookup Course', '301',
            3, 3, 3, ${collegeId}, ${subjectId})
    returning id
  `);
  courseId = course!.id;

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

  // Cancelled offering for this course.
  await db.execute(sql`
    insert into schedule_builder.offerings
      (crn, "minimumEnrollment", "maximumEnrollment", "actualEnrollment",
       "seatsAvailable", cancelled, "academicPeriod", "partOfTerm", "courseId",
       "instructorId", "scheduleTypeId", "campusId")
    values (${CANCELLED_CRN}, 0, 30, 10, 20, true, ${ACADEMIC_PERIOD},
            ${PART_OF_TERM_CODE}, ${courseId}, ${instructorId}, ${scheduleTypeId}, ${campusId})
  `);

  // Active offering for this course.
  await db.execute(sql`
    insert into schedule_builder.offerings
      (crn, "minimumEnrollment", "maximumEnrollment", "actualEnrollment",
       "seatsAvailable", cancelled, "academicPeriod", "partOfTerm", "courseId",
       "instructorId", "scheduleTypeId", "campusId")
    values (${ACTIVE_CRN}, 0, 30, 10, 20, false, ${ACADEMIC_PERIOD},
            ${PART_OF_TERM_CODE}, ${courseId}, ${instructorId}, ${scheduleTypeId}, ${campusId})
  `);
}

beforeAll(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

describe("fetchOfferingByCrn", () => {
  it("returns the course with cancelled: false for an active CRN", async () => {
    const result = await fetchOfferingByCrn(ACTIVE_CRN, ACADEMIC_PERIOD);
    expect(result).not.toBeNull();
    expect(result?.cancelled).toBe(false);
    expect(result?.course.courseId).toBe(courseId);
  });

  it("returns the course with cancelled: true for a cancelled CRN", async () => {
    const result = await fetchOfferingByCrn(CANCELLED_CRN, ACADEMIC_PERIOD);
    expect(result).not.toBeNull();
    expect(result?.cancelled).toBe(true);
    expect(result?.course.courseId).toBe(courseId);
  });

  it("returns null for an unknown CRN", async () => {
    const result = await fetchOfferingByCrn(UNKNOWN_CRN, ACADEMIC_PERIOD);
    expect(result).toBeNull();
  });
});
