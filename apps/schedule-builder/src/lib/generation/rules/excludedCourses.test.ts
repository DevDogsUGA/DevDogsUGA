import { describe, expect, it } from "vitest";
import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import { excludedCourses } from "./excludedCourses";

function testSection(courseAbbr: string, crn = 12345): Section {
  return {
    crn,
    courseAbbr,
    courseNumber: "1301",
    courseTitle: "Test Course",
    creditHours: { min: 3, max: 3 },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 10,
    actualEnrollment: 0,
    maximumEnrollment: 10,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202608,
    dateRange: { start: "2026-01-01", end: "2026-05-01" },
    meetings: [],
  };
}

describe("excludedCourses rule", () => {
  it("rejects a section when its course is in excludedCourses", () => {
    const section = testSection("CSCI");
    const ctx: GenerationConstraints = {
      excludedCourses: ["CSCI", "MATH"],
      excludedSections: [],
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(excludedCourses.allowSection?.(section, ctx)).toBe(false);
  });

  it("accepts a section when its course is not in excludedCourses", () => {
    const section = testSection("CSCI");
    const ctx: GenerationConstraints = {
      excludedCourses: ["MATH", "PHYS"],
      excludedSections: [],
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(excludedCourses.allowSection?.(section, ctx)).toBe(true);
  });
});
