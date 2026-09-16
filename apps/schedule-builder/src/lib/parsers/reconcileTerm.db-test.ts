// @vitest-environment node
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  campuses,
  colleges,
  courses,
  meetings,
  offerings,
  partsOfTerm,
  scheduleTypes,
  subjects,
  terms,
} from "~/server/db/schema";
import { reconcileTerm } from "./reconcileTerm";
import type { ResolvedTerm } from "./termPartsOfTerm";
import type { Row } from "./types";

/**
 * `reconcileTerm` against the real local Postgres: two fake terms are seeded
 * by calling `reconcileTerm` itself (simulating "last run"), then term A
 * alone is reconciled again with a changed fixture (one offering dropped, one
 * kept, one added). No unit test can see any of this: the whole point is the
 * SQL — the term-scoped `meetings` delete, and the `cancelled` UPDATE with
 * its `NOT IN ()` guard — none of which exists anywhere but the database.
 */

const PERIOD_A = 900101; // reconciled a second time — this run's target
const PERIOD_B = 900102; // never touched this run — must stay byte-identical
const PERIOD_EMPTY = 900103; // reconciled a second time with zero rows

const CRN_KEEP = 9010001;
const CRN_DROP = 9010002;
const CRN_NEW = 9010003;
const CRN_B = 9010101;
const CRN_EMPTY_1 = 9010201;
const CRN_EMPTY_2 = 9010202;

const ALL_CRNS = [
  CRN_KEEP,
  CRN_DROP,
  CRN_NEW,
  CRN_B,
  CRN_EMPTY_1,
  CRN_EMPTY_2,
];
const PERIODS = [PERIOD_A, PERIOD_B, PERIOD_EMPTY];

const NAMES = {
  college: "Reconcile Test College (reconcileTerm.db-test)",
  subjectAbbr: "RCT1",
  scheduleTypeAbbr: "RCT-SCHED (reconcileTerm.db-test)",
  campusAbbr: "RCT-CAMPUS (reconcileTerm.db-test)",
  courseAbbrA: "RCTEST 101A (reconcileTerm.db-test)",
  courseAbbrB: "RCTEST 101B (reconcileTerm.db-test)",
  courseAbbrEmpty: "RCTEST 101C (reconcileTerm.db-test)",
};
const COURSE_ABBRS = [
  NAMES.courseAbbrA,
  NAMES.courseAbbrB,
  NAMES.courseAbbrEmpty,
];

const PART_OF_TERM_CODE = "1";

function makePartOfTermRow(academicPeriod: number) {
  return {
    academicPeriod,
    code: PART_OF_TERM_CODE,
    description: "Full Term",
    classesBegin: "2026-01-01",
    dropAddEnds: "2026-01-08",
    censusDate: "2026-01-15",
    withdrawalDeadline: "2026-04-01",
    classesEnd: "2026-05-01",
  };
}

function makeRow(opts: {
  academicPeriod: number;
  crn: number;
  courseAbbr: string;
  courseNumber: string;
  time: string;
}): Row {
  return {
    ACADEMIC_PERIOD: String(opts.academicPeriod),
    "SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER": String(opts.crn),
    "SSBSECT.SSBSECT_PTRM_CODE": PART_OF_TERM_CODE,
    "SCHEDULE_OFFERING.COURSE_IDENTIFICATION": opts.courseAbbr,
    "SCHEDULE_OFFERING.COURSE_NUMBER": opts.courseNumber,
    "SCHEDULE_OFFERING.TITLE_LONG_DESC": "Reconcile Test Course",
    "SCHEDULE_OFFERING.TITLE_SHORT_DESC": "Reconcile Test",
    "SCHEDULE_OFFERING.MIN_CREDITS": "3",
    "SCHEDULE_OFFERING.MAX_CREDITS": "3",
    "SCHEDULE_OFFERING.MIN_BILLING": "3",
    "SCHEDULE_OFFERING.SUBJECT": NAMES.subjectAbbr,
    "SCHEDULE_OFFERING.SUBJECT_DESC": "Reconcile Test Subject",
    "SCHEDULE_OFFERING.COLLEGE_DESC": NAMES.college,
    "SCHEDULE_OFFERING.SCHEDULE": NAMES.scheduleTypeAbbr,
    "SCHEDULE_OFFERING.SCHEDULE_DESC": "Reconcile Test Schedule Type",
    "SCHEDULE_OFFERING.CAMPUS": NAMES.campusAbbr,
    "SCHEDULE_OFFERING.CAMPUS_DESC": "Reconcile Test Campus",
    "SCHEDULE_OFFERING.MAXIMUM_ENROLLMENT": "30",
    "SCHEDULE_OFFERING.ACTUAL_ENROLLMENT": "10",
    "SCHEDULE_OFFERING.SEATS_AVAILABLE": "20",
    "SCHEDULE_OFFERING.STATUS": "A",
    "MEETING_TIME.MONDAY_IND": "Y",
    Time: opts.time,
  };
}

function makeResolvedTerm(
  academicPeriod: number,
  description: string,
  rows: Row[],
): ResolvedTerm {
  return {
    academicPeriod,
    description,
    rows,
    partOfTermRows: [makePartOfTermRow(academicPeriod)],
  };
}

/**
 * Deletes by natural key (and by the fixed CRNs/academic periods above), so
 * this doubles as the pre-seed cleanup for a previous run that crashed before
 * its own `afterAll` ran.
 */
async function cleanup() {
  await db.delete(meetings).where(inArray(meetings.offeringCrn, ALL_CRNS));
  await db.delete(offerings).where(inArray(offerings.crn, ALL_CRNS));
  await db.delete(courses).where(inArray(courses.abbr, COURSE_ABBRS));
  await db.delete(subjects).where(eq(subjects.abbr, NAMES.subjectAbbr));
  await db.delete(colleges).where(eq(colleges.description, NAMES.college));
  await db
    .delete(scheduleTypes)
    .where(eq(scheduleTypes.abbr, NAMES.scheduleTypeAbbr));
  await db.delete(campuses).where(eq(campuses.abbr, NAMES.campusAbbr));
  await db
    .delete(partsOfTerm)
    .where(inArray(partsOfTerm.academicPeriod, PERIODS));
  await db.delete(terms).where(inArray(terms.academicPeriod, PERIODS));
}

beforeAll(async () => {
  await cleanup();

  // Simulate "last run": each term already reconciled once.
  await reconcileTerm(
    makeResolvedTerm(PERIOD_A, "Reconcile Test Term A", [
      makeRow({
        academicPeriod: PERIOD_A,
        crn: CRN_KEEP,
        courseAbbr: NAMES.courseAbbrA,
        courseNumber: "101",
        time: "10:00 AM - 10:50 AM",
      }),
      makeRow({
        academicPeriod: PERIOD_A,
        crn: CRN_DROP,
        courseAbbr: NAMES.courseAbbrA,
        courseNumber: "101",
        time: "11:00 AM - 11:50 AM",
      }),
    ]),
    db,
  );

  await reconcileTerm(
    makeResolvedTerm(PERIOD_B, "Reconcile Test Term B", [
      makeRow({
        academicPeriod: PERIOD_B,
        crn: CRN_B,
        courseAbbr: NAMES.courseAbbrB,
        courseNumber: "102",
        time: "09:00 AM - 09:50 AM",
      }),
    ]),
    db,
  );

  await reconcileTerm(
    makeResolvedTerm(PERIOD_EMPTY, "Reconcile Test Term Empty", [
      makeRow({
        academicPeriod: PERIOD_EMPTY,
        crn: CRN_EMPTY_1,
        courseAbbr: NAMES.courseAbbrEmpty,
        courseNumber: "103",
        time: "08:00 AM - 08:50 AM",
      }),
      makeRow({
        academicPeriod: PERIOD_EMPTY,
        crn: CRN_EMPTY_2,
        courseAbbr: NAMES.courseAbbrEmpty,
        courseNumber: "103",
        time: "08:00 AM - 08:50 AM",
      }),
    ]),
    db,
  );
});

afterAll(cleanup);

describe("reconcileTerm", () => {
  it("touches only the reconciled term: cancels a vanished offering, keeps/adds others, replaces only this term's meetings, and leaves other terms byte-identical", async () => {
    const beforeB_offerings = await db
      .select()
      .from(offerings)
      .where(eq(offerings.academicPeriod, PERIOD_B));
    const beforeB_meetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_B));
    const beforeKeepMeetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_KEEP));
    const beforeDropMeetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_DROP));

    expect(beforeKeepMeetings).toHaveLength(1);
    expect(beforeDropMeetings).toHaveLength(1);

    // This run: CRN_DROP vanished from the feed, CRN_KEEP's meeting time
    // changed, CRN_NEW is brand new.
    const result = await reconcileTerm(
      makeResolvedTerm(PERIOD_A, "Reconcile Test Term A", [
        makeRow({
          academicPeriod: PERIOD_A,
          crn: CRN_KEEP,
          courseAbbr: NAMES.courseAbbrA,
          courseNumber: "101",
          time: "01:00 PM - 01:50 PM",
        }),
        makeRow({
          academicPeriod: PERIOD_A,
          crn: CRN_NEW,
          courseAbbr: NAMES.courseAbbrA,
          courseNumber: "101",
          time: "02:00 PM - 02:50 PM",
        }),
      ]),
      db,
    );

    expect(result).toEqual({
      academicPeriod: PERIOD_A,
      courseCount: 1,
      offeringCount: 2,
      meetingCount: 2,
    });

    const offeringRows = await db
      .select()
      .from(offerings)
      .where(eq(offerings.academicPeriod, PERIOD_A));
    const byCrn = new Map(offeringRows.map((o) => [o.crn, o]));

    expect(byCrn.get(CRN_KEEP)?.cancelled).toBe(false);
    expect(byCrn.get(CRN_NEW)?.cancelled).toBe(false);
    // Marked cancelled, not deleted.
    expect(byCrn.get(CRN_DROP)).toBeDefined();
    expect(byCrn.get(CRN_DROP)?.cancelled).toBe(true);

    // CRN_KEEP's meeting was replaced (deleted + reinserted), not
    // accumulated: exactly one row, with the new time.
    const afterKeepMeetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_KEEP));
    expect(afterKeepMeetings).toHaveLength(1);
    expect(afterKeepMeetings[0]?.startTime).not.toBe(
      beforeKeepMeetings[0]?.startTime,
    );

    const newMeetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_NEW));
    expect(newMeetings).toHaveLength(1);

    // CRN_DROP's meeting is untouched — the scoped delete only reaches this
    // run's valid CRNs (KEEP, NEW), not every offering in the term.
    const afterDropMeetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_DROP));
    expect(afterDropMeetings).toEqual(beforeDropMeetings);

    // Term B was never passed to this run's `reconcileTerm` call at all —
    // its offerings and meetings must be untouched, byte-for-byte.
    const afterB_offerings = await db
      .select()
      .from(offerings)
      .where(eq(offerings.academicPeriod, PERIOD_B));
    const afterB_meetings = await db
      .select()
      .from(meetings)
      .where(eq(meetings.offeringCrn, CRN_B));
    expect(afterB_offerings).toEqual(beforeB_offerings);
    expect(afterB_meetings).toEqual(beforeB_meetings);
  });

  it("cancels every offering in the period when validCrns is empty, guarding the NOT IN () case", async () => {
    const result = await reconcileTerm(
      makeResolvedTerm(PERIOD_EMPTY, "Reconcile Test Term Empty", []),
      db,
    );

    expect(result).toEqual({
      academicPeriod: PERIOD_EMPTY,
      courseCount: 0,
      offeringCount: 0,
      meetingCount: 0,
    });

    const offeringRows = await db
      .select()
      .from(offerings)
      .where(eq(offerings.academicPeriod, PERIOD_EMPTY));
    expect(offeringRows).toHaveLength(2);
    expect(offeringRows.every((o) => o.cancelled)).toBe(true);
  });
});
