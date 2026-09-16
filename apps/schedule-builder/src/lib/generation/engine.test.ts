import { describe, expect, it } from "vitest";
import type { DateRange, DayOfWeek, Meeting, Section } from "../domain/section";
import type { GenerationConstraints } from "./constraints";
import {
  MAX_INPUT_COURSES,
  generateSchedules,
  type GenerationCourse,
} from "./engine";

// This ports the non-walking-distance cases from
// `../algorithm/brute-force.test.ts` onto the new rule-driven engine, run
// with an EMPTY rule registry (see `./registry.ts`) so only the engine's own
// behaviour — cartesian-product enumeration, the MAX_INPUT_COURSES guard,
// and the always-on `noConflicts` pruning — is under test.
//
// Intentionally NOT ported: the three `validateHard` walking-distance tests.
// Walking distance is dropped from this redesign; it returns later (if at
// all) as its own dormant rule module, not as engine behaviour. Likewise,
// excluded-courses/-sections, credit-hour bounds, and preference filtering
// are not ported here either — those are now features that live in rule
// modules (this package's five siblings), not in the engine itself, so they
// cannot be exercised with an empty `RULES` array.

const NO_CTX: GenerationConstraints = {
  excludedCourses: [],
  excludedSections: [],
  minCreditHours: 0,
  maxCreditHours: 0,
  showFilledClasses: true,
};

const FULL_TERM: DateRange = { start: "2026-01-08", end: "2026-05-01" };

function meeting(
  startTime: string,
  endTime: string,
  days: DayOfWeek[] = ["monday"],
): Meeting {
  return { days, startTime, endTime, building: null, room: null };
}

function section(
  crn: number,
  meetings: Meeting[],
  dateRange: DateRange | null = FULL_TERM,
): Section {
  return {
    crn,
    courseAbbr: "CSCI",
    courseNumber: "1301",
    courseTitle: "Intro to Computing",
    creditHours: { min: 3, max: 3 },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 10,
    actualEnrollment: 0,
    maximumEnrollment: 10,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202608,
    dateRange,
    meetings,
  };
}

function course(courseCode: string, sections: Section[]): GenerationCourse {
  return { courseCode, sections };
}

function crns(sections: Section[]): number[] {
  return sections.map((s) => s.crn);
}

describe("generateSchedules", () => {
  it("reports no-courses instead of returning one empty schedule", () => {
    const result = generateSchedules([], NO_CTX);

    expect(result).toEqual({ ok: false, reason: "no-courses" });
  });

  it("refuses more than MAX_INPUT_COURSES courses rather than running the search", () => {
    expect(MAX_INPUT_COURSES).toBe(10);

    const many = Array.from({ length: MAX_INPUT_COURSES + 1 }, (_, i) =>
      course(`C${i}`, [section(i, [meeting("09:00", "09:50")])]),
    );

    const result = generateSchedules(many, NO_CTX);

    expect(result).toEqual({ ok: false, reason: "too-many-courses" });
  });

  it("returns a schedule containing one section per course", () => {
    const result = generateSchedules(
      [
        course("A", [section(1, [meeting("09:00", "09:50")])]),
        course("B", [section(2, [meeting("11:00", "11:50")])]),
      ],
      NO_CTX,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedules).toHaveLength(1);
      expect(crns(result.schedules[0]!)).toEqual([1, 2]);
    }
  });

  it("reports no-schedules when every combination conflicts", () => {
    const result = generateSchedules(
      [
        course("A", [section(1, [meeting("09:00", "09:50")])]),
        course("B", [section(2, [meeting("09:30", "10:20")])]),
      ],
      NO_CTX,
    );

    expect(result).toEqual({ ok: false, reason: "no-schedules" });
  });

  it("prunes a conflicting section but keeps a non-conflicting alternative from the same course", () => {
    // Course A offers two sections: one collides with B's only section, one
    // doesn't. Only the non-conflicting combination should survive.
    const result = generateSchedules(
      [
        course("A", [
          section(1, [meeting("09:00", "09:50")]), // conflicts with B
          section(2, [meeting("13:00", "13:50")]), // does not conflict
        ]),
        course("B", [section(3, [meeting("09:30", "10:20")])]),
      ],
      NO_CTX,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedules).toHaveLength(1);
      expect(crns(result.schedules[0]!)).toEqual([2, 3]);
    }
  });

  it("never returns a schedule with an internal time conflict", () => {
    // Every combination here conflicts (same day, overlapping time), so the
    // only correct outcome is "no-schedules" — not a schedule containing a
    // conflict.
    const result = generateSchedules(
      [
        course("A", [section(1, [meeting("09:00", "10:00")])]),
        course("B", [section(2, [meeting("09:30", "10:30")])]),
      ],
      NO_CTX,
    );

    expect(result).toEqual({ ok: false, reason: "no-schedules" });
  });

  it("caps results at five, even when more valid combinations exist", () => {
    // Three courses, each pinned to its own exclusive weekday and each
    // offering two sections on that day. No combination can ever conflict
    // across courses (different weekdays) or within a course (only one
    // section per course is ever chosen), so all 2^3 = 8 combinations are
    // valid schedules.
    const result = generateSchedules(
      [
        course("A", [
          section(1, [meeting("09:00", "09:50", ["monday"])]),
          section(2, [meeting("10:00", "10:50", ["monday"])]),
        ]),
        course("B", [
          section(3, [meeting("09:00", "09:50", ["tuesday"])]),
          section(4, [meeting("10:00", "10:50", ["tuesday"])]),
        ]),
        course("C", [
          section(5, [meeting("09:00", "09:50", ["wednesday"])]),
          section(6, [meeting("10:00", "10:50", ["wednesday"])]),
        ]),
      ],
      NO_CTX,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedules).toHaveLength(5);
    }
  });
});
