"use server";

import { eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";
import { loadSections } from "~/lib/domain/loadSections";
import type { DayOfWeek as DomainDayOfWeek } from "~/lib/domain/section";
import {
  algorithmDriver,
  MAX_INPUT_COURSES,
  type AlgorithmOutcome,
} from "~/lib/algorithm/brute-force";
import type {
  AlgorithmCourse,
  AlgorithmSection,
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

/** The domain model's lowercase `DayOfWeek` to the algorithm's uppercase one. */
const ALGORITHM_DAY_MAP: Record<DomainDayOfWeek, DayOfWeek> = {
  monday: "MONDAY",
  tuesday: "TUESDAY",
  wednesday: "WEDNESDAY",
  thursday: "THURSDAY",
  friday: "FRIDAY",
  saturday: "SATURDAY",
  sunday: "SUNDAY",
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

  const allSections = await loadSections(db, {
    academicPeriod: params.academicPeriod,
    courseAbbrs: params.inputCourseNumbers,
  });

  // Sections cancelled since the last sync must not be recommended as CRNs
  // the student would then try to register for. This is an in-memory rule,
  // not a query-time filter — `loadSections` never touches `cancelled`.
  const activeSections = allSections.filter((s) => !s.cancelled);

  const filteredSections = activeSections.filter((s) => {
    if (campusId !== undefined && s.campus.id !== campusId) return false;
    if (!params.showFilledClasses && s.seatsAvailable <= 0) return false;
    return true;
  });

  const courseMap = new Map<string, AlgorithmSection[]>();
  for (const section of filteredSections) {
    const sections = courseMap.get(section.courseAbbr) ?? [];
    sections.push({
      courseCode: section.courseAbbr,
      crn: section.crn,
      professor: {
        name: section.professor?.name ?? "TBA",
        quality: section.professor?.quality ?? null,
      },
      creditHours: section.creditHours,
      // A meeting with no time is TBA (async/online). It occupies no slot,
      // so it is dropped rather than given the student's own preferred
      // hours, which would make it collide with everything else that day.
      classes: section.meetings
        .filter((m) => m.startTime && m.endTime)
        .map((m) => ({
          crn: section.crn,
          days: m.days.map((d) => ALGORITHM_DAY_MAP[d]),
          startTime: m.startTime!,
          endTime: m.endTime!,
          buildingName: m.building?.description ?? "",
          campus: section.campus.abbr,
          buildingNumber: m.building?.code ?? "",
          latitude: m.building?.lat ?? undefined,
          longitude: m.building?.lon ?? undefined,
        })),
    });
    courseMap.set(section.courseAbbr, sections);
  }

  const algorithmCourses: AlgorithmCourse[] = [...courseMap.entries()].map(
    ([courseCode, sections]) => ({ courseCode, sections }),
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
