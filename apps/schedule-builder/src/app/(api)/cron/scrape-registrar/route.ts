import { type NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { verifyCronSecret } from "~/lib/cron/auth";
import {
  BuildingCollector,
  CampusCollector,
  CollegeCollector,
  CourseCollector,
  DepartmentCollector,
  InstructorCollector,
  MeetingCollector,
  OfferingCollector,
  ScheduleTypeCollector,
  SubjectCollector,
  bulkUpsert,
  detectAvailableTerms,
  fetchPartsOfTerm,
  upsertPartsOfTerm,
} from "~/lib/parsers";
import { db } from "~/server/db";
import { terms } from "~/server/db/schema";

export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const availableTerms = await detectAvailableTerms();
  if (availableTerms.length === 0) {
    return NextResponse.json({ error: "No terms detected" }, { status: 502 });
  }

  // Fetch part-of-term calendars over HTTP up front, before opening a
  // transaction. These are slow external requests and must not hold a DB
  // connection open while they run.
  const partOfTermRows = (
    await Promise.all(
      availableTerms.map(({ academicPeriod }) =>
        fetchPartsOfTerm(academicPeriod),
      ),
    )
  ).flat();

  // ─── Phase 1: collect every row in memory (pure, no DB I/O) ────────────────
  const subjects = new SubjectCollector();
  const colleges = new CollegeCollector();
  const departments = new DepartmentCollector();
  const campuses = new CampusCollector();
  const scheduleTypes = new ScheduleTypeCollector();
  const instructors = new InstructorCollector();
  const buildings = new BuildingCollector();
  const courses = new CourseCollector();
  const offerings = new OfferingCollector();
  const meetings = new MeetingCollector();

  for (const { rows } of availableTerms) {
    for (const row of rows) {
      subjects.collect(row);
      colleges.collect(row);
      departments.collect(row);
      campuses.collect(row);
      scheduleTypes.collect(row);
      instructors.collect(row);
      buildings.collect(row);
      courses.collect(row);
      offerings.collect(row);
      meetings.collect(row);
    }
  }

  // ─── Phase 2: a handful of bulk upserts, in dependency order ───────────────
  const { courseCount, offeringCount, meetingCount } = await db.transaction(
    async (tx) => {
      await bulkUpsert(
        tx,
        terms,
        availableTerms.map(({ academicPeriod, description }) => ({
          academicPeriod,
          description,
        })),
      );
      await upsertPartsOfTerm(tx, partOfTermRows);

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
      const validCrns = await offerings.flush(
        tx,
        courseIdMap,
        instructorIdMap,
        scheduleTypeIdMap,
        campusIdMap,
      );
      const meetingCount = await meetings.flush(tx, validCrns);

      return {
        courseCount: courseIdMap.size,
        offeringCount: validCrns.size,
        meetingCount,
      };
    },
  );

  // Ensure indexes and refresh the materialized search view after each scrape.
  // These must be schema-qualified: the postgres-js connection uses the default
  // search_path ("$user", public), which does not include `schedule_builder`.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "offeringSearch_crn_idx"
      ON "schedule_builder"."offeringSearch" (crn)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "offeringSearch_fts_idx"
      ON "schedule_builder"."offeringSearch" USING gin (search_vector)
  `);

  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY "schedule_builder"."offeringSearch"`,
  );

  return NextResponse.json({
    ok: true,
    periods: availableTerms.map((t) => t.academicPeriod),
    courses: courseCount,
    offerings: offeringCount,
    meetings: meetingCount,
  });
}
