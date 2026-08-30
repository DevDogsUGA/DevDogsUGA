import type {
  AlgorithmCourse,
  AlgorithmSection,
  HConstraints,
  SConstraints,
} from "./types";
import { Schedule } from "./schedule";
import {
  computeOverallObjective,
  computeOverallObjectiveExtended,
  creditHourFloor,
  sectionsToInts,
  validate,
  validateHard,
} from "./schedule-util";

/**
 * The search is exhaustive over the cartesian product of each course's
 * sections, so the input has to stay small: at ~8 sections per course, eleven
 * courses is already ~8^11 branches.
 */
export const MAX_INPUT_COURSES = 10;

export type AlgorithmOutcome =
  | { ok: true; schedules: number[][] }
  | { ok: false; reason: "no-courses" | "too-many-courses" | "no-schedules" };

// ─── Pre-filters ──────────────────────────────────────────────────────────────

export function dataPreHardFilter(
  courses: AlgorithmCourse[],
  constraints: HConstraints,
): AlgorithmCourse[] {
  const excludedCodes = new Set(constraints.excludedCourses);
  const excludedCrns = new Set(constraints.excludedSections);

  return courses
    .filter((c) => !excludedCodes.has(c.courseCode))
    .map((c) => ({
      courseCode: c.courseCode,
      sections: c.sections.filter((s) => !excludedCrns.has(s.crn)),
    }))
    .filter((c) => c.sections.length > 0);
}

/**
 * Drops sections that violate the soft (preference) constraints. Returns the
 * surviving courses; a course with no surviving section is omitted, which the
 * driver treats as a signal to fall back rather than silently drop it.
 */
export function dataPreSoftFilter(
  courses: AlgorithmCourse[],
  constraints: SConstraints,
): AlgorithmCourse[] {
  const output: AlgorithmCourse[] = [];

  for (const course of courses) {
    const validSections = getValidSections(constraints, course);
    if (validSections.length > 0) {
      output.push({ courseCode: course.courseCode, sections: validSections });
    }
  }

  return output;
}

function getValidSections(
  constraints: SConstraints,
  course: AlgorithmCourse,
): AlgorithmSection[] {
  return course.sections.filter((section) =>
    section.classes.every((cls) => {
      if (
        constraints.prefStartTime &&
        cls.startTime < constraints.prefStartTime
      )
        return false;
      if (constraints.prefEndTime && cls.endTime > constraints.prefEndTime)
        return false;
      if (constraints.gapDay && cls.days.includes(constraints.gapDay))
        return false;
      return true;
    }),
  );
}

// ─── Schedule generation ──────────────────────────────────────────────────────

export function generateValidSchedules(
  courses: AlgorithmCourse[],
  hard: HConstraints,
): Schedule[] {
  if (courses.length === 0) return [];
  const valid: Schedule[] = [];
  generateRecursive([], [...courses], valid, hard);
  return valid;
}

function generateRecursive(
  sections: AlgorithmSection[],
  remaining: AlgorithmCourse[],
  result: Schedule[],
  hard: HConstraints,
): void {
  const schedule = new Schedule(sections);
  if (!validate(schedule)) return;

  // Credit hours only accumulate, so a partial schedule already over the cap
  // can never come back under it. Prune the whole branch here.
  if (
    hard.maxCreditHours > 0 &&
    creditHourFloor(schedule) > hard.maxCreditHours
  )
    return;

  if (remaining.length === 0) {
    // An empty section list validates vacuously; it is not a schedule.
    if (sections.length > 0 && validateHard(schedule, hard)) {
      result.push(schedule);
    }
    return;
  }

  const [next, ...rest] = remaining;
  for (const section of next!.sections) {
    generateRecursive([...sections, section], rest, result, hard);
  }
}

// ─── Optimise ─────────────────────────────────────────────────────────────────

function optimize(
  courses: AlgorithmCourse[],
  soft: SConstraints,
  hard: HConstraints,
  usesSoft: boolean,
): number[][] {
  const validSchedules = generateValidSchedules(courses, hard);
  if (validSchedules.length === 0) return [];

  const scored = validSchedules
    .map((s) => ({
      schedule: s,
      score: usesSoft
        ? computeOverallObjectiveExtended(s, soft)
        : computeOverallObjective(s),
    }))
    .sort((a, b) => b.score - a.score);

  return scored
    .slice(0, 5)
    .map(({ schedule }) => sectionsToInts(schedule.sections));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function algorithmDriver(
  inputCourses: AlgorithmCourse[],
  soft: SConstraints,
  hard: HConstraints,
): AlgorithmOutcome {
  if (inputCourses.length === 0) return { ok: false, reason: "no-courses" };
  if (inputCourses.length > MAX_INPUT_COURSES)
    return { ok: false, reason: "too-many-courses" };

  const courses = dataPreHardFilter([...inputCourses], hard);
  if (courses.length === 0) return { ok: false, reason: "no-courses" };

  // Soft constraints are preferences, not requirements. Filtering by them is
  // only safe while every requested course keeps at least one section; once one
  // would drop out, generate over the full set and let the extended objective
  // score the preferences instead of silently omitting a course.
  const filtered = dataPreSoftFilter(courses, soft);
  const schedules =
    filtered.length === courses.length
      ? optimize(filtered, soft, hard, false)
      : optimize(courses, soft, hard, true);

  return schedules.length === 0
    ? { ok: false, reason: "no-schedules" }
    : { ok: true, schedules };
}
