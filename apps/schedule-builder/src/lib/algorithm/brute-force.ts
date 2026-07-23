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
  sectionsToInts,
  validate,
} from "./schedule-util";

// ─── Pre-filters ──────────────────────────────────────────────────────────────

export function dataPreHardFilter(
  courses: AlgorithmCourse[],
  constraints: HConstraints,
): AlgorithmCourse[] {
  const excludedCodes = new Set(
    constraints.excludedCourses.map((c) => c.courseCode),
  );
  return courses.filter((c) => !excludedCodes.has(c.courseCode));
}

export function dataPreSoftFilter(
  courses: AlgorithmCourse[],
  constraints: SConstraints,
): AlgorithmCourse[] {
  if (courses.length === 0) throw new Error("Input course list is empty.");
  if (courses.length > 10)
    throw new Error("Input course list contains more than ten courses.");

  const output: AlgorithmCourse[] = [];

  for (const course of courses) {
    const validSections = getValidSections(constraints, course);
    if (validSections.length > 0) {
      output.push({ courseCode: course.courseCode, sections: validSections });
    }
  }

  if (output.length === 0) throw new Error("All requested courses are invalid.");
  return output;
}

function getValidSections(
  constraints: SConstraints,
  course: AlgorithmCourse,
): AlgorithmSection[] {
  return course.sections.filter((section) =>
    section.classes.every((cls) => {
      if (constraints.prefStartTime && cls.startTime < constraints.prefStartTime)
        return false;
      if (constraints.prefEndTime && cls.startTime > constraints.prefEndTime)
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
): Schedule[] {
  const valid: Schedule[] = [];
  generateRecursive([], [...courses], valid);
  return valid;
}

function generateRecursive(
  sections: AlgorithmSection[],
  remaining: AlgorithmCourse[],
  result: Schedule[],
): void {
  const schedule = new Schedule(sections);
  if (!validate(schedule)) return;

  if (remaining.length === 0) {
    result.push(schedule);
    return;
  }

  const [next, ...rest] = remaining;
  for (const section of next!.sections) {
    generateRecursive([...sections, section], rest, result);
  }
}

// ─── Optimise ─────────────────────────────────────────────────────────────────

function optimize(
  courses: AlgorithmCourse[],
  soft: SConstraints,
  usesSoft: boolean,
): number[][] {
  const validSchedules = generateValidSchedules(courses);
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
): number[][] | null {
  let courses = [...inputCourses];

  try {
    courses = dataPreHardFilter(courses, hard);
  } catch {
    return null;
  }

  try {
    courses = dataPreSoftFilter(courses, soft);
    return optimize(courses, soft, false);
  } catch {
    return optimize(courses, soft, true);
  }
}
