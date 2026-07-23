"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";
import { algorithmDriver } from "~/lib/algorithm/brute-force";
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

export async function getRecommendedSchedules(
  params: GenerateScheduleParams,
): Promise<{ data: number[][] }> {
  // Resolve campus ID
  const campusRows = await db
    .select({ id: schema.campuses.id })
    .from(schema.campuses)
    .where(eq(schema.campuses.abbr, params.inputCampus))
    .limit(1);
  const campusId = campusRows[0]?.id;

  if (params.inputCourseNumbers.length === 0) return { data: [] };

  // Build algorithm course structures
  type OfferingAcc = {
    crn: number;
    campusId: number;
    seats: number;
    instructorFirst: string | null;
    instructorLast: string | null;
    avgRating: number;
    campusAbbr: string;
    meetings: {
      monday: boolean | null;
      tuesday: boolean | null;
      wednesday: boolean | null;
      thursday: boolean | null;
      friday: boolean | null;
      saturday: boolean | null;
      sunday: boolean | null;
      startTime: string | null;
      endTime: string | null;
      buildingLat: number | null;
      buildingLon: number | null;
      buildingDesc: string | null;
    }[];
  };

  const courseMap = new Map<string, Map<number, OfferingAcc>>();

  const matchingRows = await db
    .select({
      courseAbbr: schema.courses.abbr,
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
    .innerJoin(schema.offerings, eq(schema.offerings.courseId, schema.courses.id))
    .innerJoin(schema.campuses, eq(schema.offerings.campusId, schema.campuses.id))
    .leftJoin(schema.instructors, eq(schema.offerings.instructorId, schema.instructors.id))
    .leftJoin(schema.meetings, eq(schema.meetings.offeringCrn, schema.offerings.crn))
    .leftJoin(schema.buildings, eq(schema.meetings.buildingId, schema.buildings.id))
    .where(
      and(
        inArray(schema.courses.abbr, params.inputCourseNumbers),
        eq(schema.offerings.academicPeriod, params.academicPeriod),
      ),
    );

  for (const row of matchingRows) {
    if (campusId && row.offeringCampusId !== campusId) continue;
    if (!params.showFilledClasses && row.seatsAvailable <= 0) continue;
    if (params.excludedSectionCrns.includes(row.offeringCrn)) continue;

    if (!courseMap.has(row.courseAbbr)) courseMap.set(row.courseAbbr, new Map());
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
        meetings: [],
      });
    }
    if (row.monday != null) {
      offeringsMap.get(row.offeringCrn)!.meetings.push(row);
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
            startTime: m.startTime ?? `${pad(params.prefStartTime)}:00`,
            endTime: m.endTime ?? `${pad(params.prefEndTime)}:00`,
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
    excludedCourses: [],
    excludedSections: [],
    campus: params.inputCampus,
    minCreditHours: params.minCreditHours,
    maxCreditHours: params.maxCreditHours,
    walking: params.walking,
  };

  const result = algorithmDriver(algorithmCourses, soft, hard);
  return { data: result ?? [] };
}
