import type { createDb } from "@devdogsuga/drizzle";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import {
  buildings,
  campuses,
  courses,
  instructors,
  meetings,
  offerings,
  partsOfTerm,
  scheduleTypes,
} from "~/server/db/schema";
import type { relations } from "~/server/db/relations";
import type { DayOfWeek, Meeting, Section } from "./section";

/**
 * Typed off the env-independent `createDb` factory + `relations` rather than
 * `~/server/db`'s `createScheduleBuilderDb`/`db` — importing that module
 * runs `~/env`'s `createEnv(...)` at module load, which throws outside a
 * real Next.js/Worker environment (e.g. this file's own pure unit test).
 */
type Db = ReturnType<typeof createDb<typeof relations>>;

export interface LoadSectionsFilters {
  academicPeriod?: number;
  courseAbbrs?: string[];
  crns?: number[];
}

/**
 * One flat row out of the courses ⋈ offerings ⋈ partsOfTerm join, LEFT
 * JOINed out to a single meeting/building. Multiple rows share an
 * `(academicPeriod, crn)` when an offering has more than one meeting;
 * `groupRowsIntoSections` folds them back together.
 *
 * Every field here is an identity column carried straight off a table —
 * no derived shape (days arrays, nested objects, usability) belongs in the
 * query. That folding happens in `groupRowsIntoSections`.
 */
export interface SectionRow {
  crn: number;
  courseAbbr: string;
  courseNumber: string;
  courseTitle: string;
  minCreditHours: number;
  maxCreditHours: number;
  campusId: number;
  campusAbbr: string;
  campusDescription: string;
  instructorId: number | null;
  instructorFirstName: string | null;
  instructorLastName: string | null;
  seatsAvailable: number;
  actualEnrollment: number;
  maximumEnrollment: number;
  cancelled: boolean;
  lastSeenAt: Date;
  academicPeriod: number;
  classesBegin: string | null;
  classesEnd: string | null;
  meetingId: number | null;
  monday: boolean | null;
  tuesday: boolean | null;
  wednesday: boolean | null;
  thursday: boolean | null;
  friday: boolean | null;
  saturday: boolean | null;
  sunday: boolean | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  buildingId: number | null;
  buildingDescription: string | null;
  buildingLatitude: number | null;
  buildingLongitude: number | null;
}

const DAY_COLUMNS: { flag: keyof SectionRow; day: DayOfWeek }[] = [
  { flag: "monday", day: "monday" },
  { flag: "tuesday", day: "tuesday" },
  { flag: "wednesday", day: "wednesday" },
  { flag: "thursday", day: "thursday" },
  { flag: "friday", day: "friday" },
  { flag: "saturday", day: "saturday" },
  { flag: "sunday", day: "sunday" },
];

function daysFromRow(row: SectionRow): DayOfWeek[] {
  return DAY_COLUMNS.filter(({ flag }) => row[flag] === true).map(
    ({ day }) => day,
  );
}

function meetingFromRow(row: SectionRow): Meeting {
  return {
    days: daysFromRow(row),
    startTime: row.startTime,
    endTime: row.endTime,
    room: row.room,
    building:
      row.buildingId !== null
        ? {
            // `buildings.id` IS the Banner building number — the table has
            // no separate text `code` column — so it is stringified here to
            // meet the domain contract's `code: string`.
            code: String(row.buildingId),
            description: row.buildingDescription,
            lat: row.buildingLatitude,
            lon: row.buildingLongitude,
          }
        : null,
  };
}

/**
 * PURE fold of flat join rows into `Section[]`. Rows sharing an
 * `(academicPeriod, crn)` collapse into one `Section` with one `Meeting` per
 * distinct meeting row. Banner reuses CRNs between terms.
 *
 * Deliberately does not filter on `cancelled`/`lastSeenAt` (or anything
 * else) — usability is an in-memory rule for downstream consumers, never a
 * query-time or fold-time filter here.
 */
export function groupRowsIntoSections(rows: SectionRow[]): Section[] {
  const sections = new Map<string, Section>();

  for (const row of rows) {
    const key = `${row.academicPeriod}:${row.crn}`;
    let section = sections.get(key);
    if (!section) {
      section = {
        crn: row.crn,
        courseAbbr: row.courseAbbr,
        courseNumber: row.courseNumber,
        courseTitle: row.courseTitle,
        creditHours: { min: row.minCreditHours, max: row.maxCreditHours },
        campus: {
          id: row.campusId,
          abbr: row.campusAbbr,
          description: row.campusDescription,
        },
        professor:
          row.instructorId !== null
            ? {
                name: `${row.instructorFirstName} ${row.instructorLastName}`,
                quality: null,
              }
            : null,
        seatsAvailable: row.seatsAvailable,
        actualEnrollment: row.actualEnrollment,
        maximumEnrollment: row.maximumEnrollment,
        cancelled: row.cancelled,
        lastSeenAt: row.lastSeenAt,
        academicPeriod: row.academicPeriod,
        dateRange:
          row.classesBegin && row.classesEnd
            ? { start: row.classesBegin, end: row.classesEnd }
            : null,
        meetings: [],
      };
      sections.set(key, section);
    }

    if (row.meetingId !== null) {
      section.meetings.push(meetingFromRow(row));
    }
  }

  return [...sections.values()];
}

/**
 * Runs the one query every downstream package should use to read sections:
 * courses ⋈ offerings ⋈ partsOfTerm (matching `(academicPeriod, partOfTerm)`
 * to `(academicPeriod, code)`) ⋈ campuses ⋈ scheduleTypes, LEFT JOINed out to
 * instructors, meetings, and buildings.
 *
 * No filter here ever touches `cancelled`/`lastSeenAt` — usability is an
 * in-memory rule downstream, never a SQL filter.
 */
export async function loadSections(
  db: Db,
  filters: LoadSectionsFilters = {},
): Promise<Section[]> {
  const conditions: SQL[] = [];
  if (filters.academicPeriod !== undefined) {
    conditions.push(eq(offerings.academicPeriod, filters.academicPeriod));
  }
  if (filters.courseAbbrs && filters.courseAbbrs.length > 0) {
    conditions.push(inArray(courses.abbr, filters.courseAbbrs));
  }
  if (filters.crns && filters.crns.length > 0) {
    conditions.push(inArray(offerings.crn, filters.crns));
  }

  const query = db
    .select({
      crn: offerings.crn,
      courseAbbr: courses.abbr,
      courseNumber: courses.courseNumber,
      courseTitle: courses.title,
      minCreditHours: courses.minCreditHours,
      maxCreditHours: courses.maxCreditHours,
      campusId: campuses.id,
      campusAbbr: campuses.abbr,
      campusDescription: campuses.description,
      instructorId: instructors.id,
      instructorFirstName: instructors.firstName,
      instructorLastName: instructors.lastName,
      seatsAvailable: offerings.seatsAvailable,
      actualEnrollment: offerings.actualEnrollment,
      maximumEnrollment: offerings.maximumEnrollment,
      cancelled: offerings.cancelled,
      lastSeenAt: offerings.lastSeenAt,
      academicPeriod: offerings.academicPeriod,
      classesBegin: partsOfTerm.classesBegin,
      classesEnd: partsOfTerm.classesEnd,
      meetingId: meetings.id,
      monday: meetings.monday,
      tuesday: meetings.tuesday,
      wednesday: meetings.wednesday,
      thursday: meetings.thursday,
      friday: meetings.friday,
      saturday: meetings.saturday,
      sunday: meetings.sunday,
      startTime: meetings.startTime,
      endTime: meetings.endTime,
      room: meetings.room,
      buildingId: buildings.id,
      buildingDescription: buildings.description,
      buildingLatitude: buildings.latitude,
      buildingLongitude: buildings.longitude,
    })
    .from(courses)
    .innerJoin(offerings, eq(offerings.courseId, courses.id))
    .innerJoin(
      partsOfTerm,
      and(
        eq(partsOfTerm.academicPeriod, offerings.academicPeriod),
        eq(partsOfTerm.code, offerings.partOfTerm),
      ),
    )
    .innerJoin(campuses, eq(campuses.id, offerings.campusId))
    .innerJoin(scheduleTypes, eq(scheduleTypes.id, offerings.scheduleTypeId))
    .leftJoin(instructors, eq(instructors.id, offerings.instructorId))
    .leftJoin(
      meetings,
      and(
        eq(meetings.academicPeriod, offerings.academicPeriod),
        eq(meetings.offeringCrn, offerings.crn),
      ),
    )
    .leftJoin(buildings, eq(buildings.id, meetings.buildingId));

  const rows =
    conditions.length > 0 ? await query.where(and(...conditions)) : await query;

  return groupRowsIntoSections(rows);
}
