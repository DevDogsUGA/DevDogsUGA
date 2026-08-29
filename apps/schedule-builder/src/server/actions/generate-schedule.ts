"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";
import {
  algorithmDriver,
  MAX_INPUT_COURSES,
  type AlgorithmOutcome,
} from "~/lib/algorithm/brute-force";
import type {
  AlgorithmCourse,
  DayOfWeek,
  HConstraints,
  SConstraints,
} from "~/lib/algorithm/types";

export interface GenerateScheduleParams {
  academicPeriod: number;
  /** Qualified course abbreviations, e.g. ["CSCI1302", "MATH2250"] */
  inputCourseNumbers: string[];
  excludedSectionCrns: number[];
  excludedCourseIDs: number[];
  /** Hour integer 0–23 */
  prefStartTime: number;
  /** Hour integer 0–23 */
  prefEndTime: number;
  /** Day letter: "M" | "T" | "W" | "R" | "F" | "" */
  gapDay: string;
  inputCampus: string;
  minCreditHours: number;
  maxCreditHours: number;
  showFilledClasses: boolean;
  walking: boolean;
}

const DAY_MAP: Record<string, DayOfWeek> = {
  M: "MONDAY",
  T: "TUESDAY",
  W: "WEDNESDAY",
  R: "THURSDAY",
  F: "FRIDAY",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const FAILURE_MESSAGES: Record<
  Extract<AlgorithmOutcome, { ok: false }>["reason"],
  string
> = {
  "no-courses":
    "None of the selected courses have sections in this term matching your filters.",
  "too-many-courses": `Generating a schedule is limited to ${MAX_INPUT_COURSES} courses at a time.`,
  "no-schedules":
    "No schedules found matching your criteria — try adjusting your filters or included courses/sections.",
};

export async function getRecommendedSchedules(
  params: GenerateScheduleParams,
): Promise<{ data: number[][]; error?: string }> {
  if (params.inputCourseNumbers.length === 0) {
    return {
      data: [],
      error: "Select at least one course to generate a schedule.",
    };
  }
  if (params.inputCourseNumbers.length > MAX_INPUT_COURSES) {
    return {
      data: [],
      error: `Generating a schedule is limited to ${MAX_INPUT_COURSES} courses at a time — you selected ${params.inputCourseNumbers.length}.`,
    };
  }

  // `campusOptions` is keyed by the human-readable campus name, which the
  // registrar feed stores as `description`; `abbr` holds the Banner code.
  const campusRows = await db
    .select({ id: schema.campuses.id })
    .from(schema.campuses)
    .where(eq(schema.campuses.description, params.inputCampus))
    .limit(1);
  const campusId = campusRows[0]?.id;

  // Falling through with an unresolved campus would silently ignore the filter
  // and hand back sections from every campus.
  if (params.inputCampus && campusId === undefined) {
    return {
      data: [],
      error: `No sections found for the ${params.inputCampus} campus.`,
    };
  }

  const excludedCourseAbbrs =
    params.excludedCourseIDs.length > 0
      ? (
          await db
            .select({ abbr: schema.courses.abbr })
            .from(schema.courses)
            .where(inArray(schema.courses.id, params.excludedCourseIDs))
        ).map((r) => r.abbr)
      : [];

  // Build algorithm course structures
  type OfferingAcc = {
    crn: number;
    campusId: number;
    seats: number;
    instructorFirst: string | null;
    instructorLast: string | null;
    avgRating: number;
    campusAbbr: string;
    creditHours: { min: number; max: number };
    meetings: {
      monday: boolean | null;
      tuesday: boolean | null;
      wednesday: boolean | null;
      thursday: boolean | null;
      friday: boolean | null;
      saturday: boolean | null;
      sunday: boolean | null;
      startTime: string;
      endTime: string;
      buildingLat: number | null;
      buildingLon: number | null;
      buildingDesc: string | null;
    }[];
  };

  const courseMap = new Map<string, Map<number, OfferingAcc>>();

  const matchingRows = await db
    .select({
      courseAbbr: schema.courses.abbr,
      courseMinCreditHours: schema.courses.minCreditHours,
      courseMaxCreditHours: schema.courses.maxCreditHours,
      offeringCrn: schema.offerings.crn,
      offeringCampusId: schema.offerings.campusId,
      seatsAvailable: schema.offerings.seatsAvailable,
      instructorFirst: schema.instructors.firstName,
      instructorLast: schema.instructors.lastName,
      averageRating: schema.instructors.averageRating,
      monday: schema.meetings.monday,
      tuesday: schema.meetings.tuesday,
      wednesday: schema.meetings.wednesday,
      thursday: schema.meetings.thursday,
      friday: schema.meetings.friday,
      saturday: schema.meetings.saturday,
      sunday: schema.meetings.sunday,
      startTime: schema.meetings.startTime,
      endTime: schema.meetings.endTime,
      buildingLat: schema.buildings.latitude,
      buildingLon: schema.buildings.longitude,
      buildingDesc: schema.buildings.description,
      campusAbbr: schema.campuses.abbr,
    })
    .from(schema.courses)
    .innerJoin(
      schema.offerings,
      eq(schema.offerings.courseId, schema.courses.id),
    )
    .innerJoin(
      schema.campuses,
      eq(schema.offerings.campusId, schema.campuses.id),
    )
    .leftJoin(
      schema.instructors,
      eq(schema.offerings.instructorId, schema.instructors.id),
    )
    .leftJoin(
      schema.meetings,
      eq(schema.meetings.offeringCrn, schema.offerings.crn),
    )
    .leftJoin(
      schema.buildings,
      eq(schema.meetings.buildingId, schema.buildings.id),
    )
    .where(
      and(
        inArray(schema.courses.abbr, params.inputCourseNumbers),
        eq(schema.offerings.academicPeriod, params.academicPeriod),
        // Sections cancelled since the last sync must not be recommended as
        // CRNs the student then tries to register for.
        eq(schema.offerings.active, true),
      ),
    );

  for (const row of matchingRows) {
    if (campusId !== undefined && row.offeringCampusId !== campusId) continue;
    if (!params.showFilledClasses && row.seatsAvailable <= 0) continue;

    if (!courseMap.has(row.courseAbbr))
      courseMap.set(row.courseAbbr, new Map());
    const offeringsMap = courseMap.get(row.courseAbbr)!;

    if (!offeringsMap.has(row.offeringCrn)) {
      offeringsMap.set(row.offeringCrn, {
        crn: row.offeringCrn,
        campusId: row.offeringCampusId,
        seats: row.seatsAvailable,
        instructorFirst: row.instructorFirst,
        instructorLast: row.instructorLast,
        avgRating: row.averageRating ?? 0,
        campusAbbr: row.campusAbbr,
        creditHours: {
          min: row.courseMinCreditHours,
          max: row.courseMaxCreditHours,
        },
        meetings: [],
      });
    }
    // A meeting with no time is TBA (async/online). It occupies no slot, so it
    // is dropped rather than given the student's own preferred hours, which
    // would make it collide with everything else that day.
    if (row.monday != null && row.startTime && row.endTime) {
      offeringsMap.get(row.offeringCrn)!.meetings.push({
        ...row,
        startTime: row.startTime,
        endTime: row.endTime,
      });
    }
  }

  const algorithmCourses: AlgorithmCourse[] = [...courseMap.entries()].map(
    ([courseAbbr, offeringsMap]) => ({
      courseCode: courseAbbr,
      sections: [...offeringsMap.values()].map((o) => ({
        courseCode: courseAbbr,
        crn: o.crn,
        professor: {
          name: o.instructorFirst
            ? `${o.instructorFirst} ${o.instructorLast ?? ""}`
            : "TBA",
          quality: o.avgRating,
        },
        creditHours: o.creditHours,
        classes: o.meetings.map((m) => {
          const days: DayOfWeek[] = (
            [
              m.monday && "MONDAY",
              m.tuesday && "TUESDAY",
              m.wednesday && "WEDNESDAY",
              m.thursday && "THURSDAY",
              m.friday && "FRIDAY",
              m.saturday && "SATURDAY",
              m.sunday && "SUNDAY",
            ] as (DayOfWeek | false)[]
          ).filter((d): d is DayOfWeek => d !== false);

          return {
            crn: o.crn,
            days,
            startTime: m.startTime,
            endTime: m.endTime,
            buildingName: m.buildingDesc ?? "",
            campus: o.campusAbbr,
            buildingNumber: String(m.buildingLat ?? ""),
            latitude: m.buildingLat ?? undefined,
            longitude: m.buildingLon ?? undefined,
          };
        }),
      })),
    }),
  );

  const soft: SConstraints = {
    gapDay: DAY_MAP[params.gapDay],
    prefStartTime: params.prefStartTime
      ? `${pad(params.prefStartTime)}:00`
      : undefined,
    prefEndTime: params.prefEndTime
      ? `${pad(params.prefEndTime)}:00`
      : undefined,
    showFilledClasses: params.showFilledClasses,
  };

  const hard: HConstraints = {
    excludedCourses: excludedCourseAbbrs,
    excludedSections: params.excludedSectionCrns,
    campus: params.inputCampus,
    minCreditHours: params.minCreditHours,
    maxCreditHours: params.maxCreditHours,
    walking: params.walking,
  };

  const outcome = algorithmDriver(algorithmCourses, soft, hard);
  if (outcome.ok) return { data: outcome.schedules };

  return { data: [], error: FAILURE_MESSAGES[outcome.reason] };
}
