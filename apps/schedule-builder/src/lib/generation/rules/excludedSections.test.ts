import { describe, expect, it } from "vitest";
import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import { excludedSections } from "./excludedSections";

function testSection(crn: number, courseAbbr = "CSCI"): Section {
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

describe("excludedSections rule", () => {
  it("rejects a section when its crn is in excludedSections", () => {
    const section = testSection(12345);
    const ctx: GenerationConstraints = {
      excludedCourses: [],
      excludedSections: [12345, 67890],
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(excludedSections.allowSection?.(section, ctx)).toBe(false);
  });

  it("accepts a section when its crn is not in excludedSections", () => {
    const section = testSection(12345);
    const ctx: GenerationConstraints = {
      excludedCourses: [],
      excludedSections: [67890, 54321],
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(excludedSections.allowSection?.(section, ctx)).toBe(true);
  });
});
