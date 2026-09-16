import { describe, expect, it } from "vitest";
import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import { campus } from "./campus";

function testSection(campusId: number, crn = 12345): Section {
  return {
    crn,
    courseAbbr: "CSCI",
    courseNumber: "1301",
    courseTitle: "Test Course",
    creditHours: { min: 3, max: 3 },
    campus: { id: campusId, abbr: "ATH", description: "Athens" },
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

describe("campus rule", () => {
  it("rejects a section when campusId is set and section.campus.id does not match", () => {
    const section = testSection(1); // campus.id = 1
    const ctx: GenerationConstraints = {
      excludedCourses: [],
      excludedSections: [],
      campusId: 2, // different campus
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(campus.allowSection?.(section, ctx)).toBe(false);
  });

  it("accepts a section when campusId is set and section.campus.id matches", () => {
    const section = testSection(2); // campus.id = 2
    const ctx: GenerationConstraints = {
      excludedCourses: [],
      excludedSections: [],
      campusId: 2, // same campus
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(campus.allowSection?.(section, ctx)).toBe(true);
  });

  it("accepts a section when campusId is undefined (no campus filter)", () => {
    const section = testSection(1); // campus.id = 1
    const ctx: GenerationConstraints = {
      excludedCourses: [],
      excludedSections: [],
      campusId: undefined, // no campus filter
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(campus.allowSection?.(section, ctx)).toBe(true);
  });

  it("accepts all sections when campusId is undefined, regardless of section campus", () => {
    const section2 = testSection(2);
    const section5 = testSection(5, 54321);
    const ctx: GenerationConstraints = {
      excludedCourses: [],
      excludedSections: [],
      campusId: undefined,
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: false,
    };

    expect(campus.allowSection?.(section2, ctx)).toBe(true);
    expect(campus.allowSection?.(section5, ctx)).toBe(true);
  });
});
