import { and, eq, notInArray } from "drizzle-orm";
import type { db } from "~/server/db";
import { offerings, terms } from "~/server/db/schema";
import { BuildingCollector } from "./BuildingParser";
import { bulkUpsert } from "./bulkUpsert";
import { CampusCollector } from "./CampusParser";
import { CollegeCollector } from "./CollegeParser";
import { CourseCollector } from "./CourseParser";
import { DepartmentCollector } from "./DepartmentParser";
import { InstructorCollector } from "./InstructorParser";
import { MeetingCollector } from "./MeetingParser";
import { OfferingCollector } from "./OfferingParser";
import { upsertPartsOfTerm } from "./PartOfTermScraper";
import { ScheduleTypeCollector } from "./ScheduleTypeParser";
import { SubjectCollector } from "./SubjectParser";
import type { ResolvedTerm } from "./termPartsOfTerm";

/**
 * Plain, JSON-serializable — this is later returned from a Cloudflare
 * Workflow step, which persists its return value between steps, so it must
 * not carry a class instance, a Map, a Drizzle row, or anything else that
 * doesn't survive a `JSON.stringify`/`JSON.parse` round trip.
 */
export type TermReconcileResult = {
  academicPeriod: number;
  courseCount: number;
  offeringCount: number;
  meetingCount: number;
};

/**
 * Reconciles ONE term's registrar rows against the current schema, entirely
 * inside its own transaction.
 *
 * Scoped to a single term for two reasons: (1) a DB failure on one term (a
 * bad row, a constraint violation) must not roll back or block every other
 * term in the same scrape run; (2) it lets every collector — most pointedly
 * `MeetingCollector`, which has no natural key and used to `DELETE` the whole
 * table on every run — replace only this term's rows instead of every term's.
 *
 * `partsOfTerm` is upserted before `offerings`: `offerings` carries a
 * composite FK to `(academicPeriod, partOfTerm)`, so the parent row must
 * exist first within the same transaction.
 */
export async function reconcileTerm(
  term: ResolvedTerm,
  database: typeof db,
): Promise<TermReconcileResult> {
  // Fresh collectors per term: nothing here is shared or reused across terms,
  // so one term's reconcile can't leak rows into another's.
  const subjects = new SubjectCollector();
  const colleges = new CollegeCollector();
  const departments = new DepartmentCollector();
  const campuses = new CampusCollector();
  const scheduleTypes = new ScheduleTypeCollector();
  const instructors = new InstructorCollector();
  const buildings = new BuildingCollector();
  const courses = new CourseCollector();
  const offeringCollector = new OfferingCollector();
  const meetingCollector = new MeetingCollector();

  for (const row of term.rows) {
    subjects.collect(row);
    colleges.collect(row);
    departments.collect(row);
    campuses.collect(row);
    scheduleTypes.collect(row);
    instructors.collect(row);
    buildings.collect(row);
    courses.collect(row);
    offeringCollector.collect(row);
    meetingCollector.collect(row);
  }

  return database.transaction(async (tx) => {
    await bulkUpsert(tx, terms, [
      { academicPeriod: term.academicPeriod, description: term.description },
    ]);
    await upsertPartsOfTerm(tx, term.partOfTermRows);

    const [
      subjectIdMap,
      collegeIdMap,
      campusIdMap,
      scheduleTypeIdMap,
      instructorIdMap,
    ] = await Promise.all([
      subjects.flush(tx),
      colleges.flush(tx),
      campuses.flush(tx),
      scheduleTypes.flush(tx),
      instructors.flush(tx),
      buildings.flush(tx),
    ]);

    const departmentIdMap = await departments.flush(tx, collegeIdMap);
    const courseIdMap = await courses.flush(
      tx,
      subjectIdMap,
      collegeIdMap,
      departmentIdMap,
    );
    const validCrns = await offeringCollector.flush(
      tx,
      courseIdMap,
      instructorIdMap,
      scheduleTypeIdMap,
      campusIdMap,
    );
    const meetingCount = await meetingCollector.flush(
      tx,
      term.academicPeriod,
      validCrns,
    );

    // Anything that used to be in this term's feed but isn't anymore is
    // cancelled, not deleted — past enrollment and saved plans still
    // reference the CRN. `NOT IN ()` with an empty list is invalid SQL (and
    // would in any case match nothing), so an empty `validCrns` — every
    // offering vanished from this term's feed — cancels the whole academic
    // period outright instead of building that clause.
    if (validCrns.size > 0) {
      await tx
        .update(offerings)
        .set({ cancelled: true })
        .where(
          and(
            eq(offerings.academicPeriod, term.academicPeriod),
            notInArray(offerings.crn, [...validCrns]),
          ),
        );
    } else {
      await tx
        .update(offerings)
        .set({ cancelled: true })
        .where(eq(offerings.academicPeriod, term.academicPeriod));
    }

    return {
      academicPeriod: term.academicPeriod,
      courseCount: courseIdMap.size,
      offeringCount: validCrns.size,
      meetingCount,
    };
  });
}
