import { describe, it, expect } from "vitest";
import { professorQuality } from "./professorQuality";
import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";

describe("professorQuality rule", () => {
  const ctx: GenerationConstraints = {
    excludedCourses: [],
    excludedSections: [],
    minCreditHours: 0,
    maxCreditHours: 0,
    showFilledClasses: false,
  };

  describe("isActive", () => {
    it("returns false unconditionally (rule is dormant)", () => {
      expect(professorQuality.isActive?.(ctx)).toBe(false);
    });
  });

  describe("score", () => {
    it("does not throw when all sections have null quality", () => {
      const sections: Section[] = [
        {
          crn: 1,
          courseAbbr: "CS",
          courseNumber: "101",
          courseTitle: "Intro to CS",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Smith", quality: null },
          seatsAvailable: 5,
          actualEnrollment: 25,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
        {
          crn: 2,
          courseAbbr: "CS",
          courseNumber: "102",
          courseTitle: "Data Structures",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Jones", quality: null },
          seatsAvailable: 3,
          actualEnrollment: 27,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
      ];

      expect(() => {
        professorQuality.score?.(sections, ctx);
      }).not.toThrow();
    });

    it("returns a number when all qualities are null", () => {
      const sections: Section[] = [
        {
          crn: 1,
          courseAbbr: "CS",
          courseNumber: "101",
          courseTitle: "Intro to CS",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Smith", quality: null },
          seatsAvailable: 5,
          actualEnrollment: 25,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
      ];

      const result = professorQuality.score?.(sections, ctx);
      expect(typeof result).toBe("number");
    });

    it("returns 0 when all qualities are null", () => {
      const sections: Section[] = [
        {
          crn: 1,
          courseAbbr: "CS",
          courseNumber: "101",
          courseTitle: "Intro to CS",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Smith", quality: null },
          seatsAvailable: 5,
          actualEnrollment: 25,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
      ];

      const result = professorQuality.score?.(sections, ctx);
      expect(result).toBe(0);
    });

    it("averages quality values excluding nulls", () => {
      const sections: Section[] = [
        {
          crn: 1,
          courseAbbr: "CS",
          courseNumber: "101",
          courseTitle: "Intro to CS",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Smith", quality: 4.5 },
          seatsAvailable: 5,
          actualEnrollment: 25,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
        {
          crn: 2,
          courseAbbr: "CS",
          courseNumber: "102",
          courseTitle: "Data Structures",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Jones", quality: null },
          seatsAvailable: 3,
          actualEnrollment: 27,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
        {
          crn: 3,
          courseAbbr: "CS",
          courseNumber: "103",
          courseTitle: "Algorithms",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Brown", quality: 3.5 },
          seatsAvailable: 2,
          actualEnrollment: 28,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
      ];

      const result = professorQuality.score?.(sections, ctx);
      // Average of 4.5 and 3.5 = 4.0
      expect(result).toBe(4.0);
    });

    it("handles sections with null professor", () => {
      const sections: Section[] = [
        {
          crn: 1,
          courseAbbr: "CS",
          courseNumber: "101",
          courseTitle: "Intro to CS",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: { name: "Dr. Smith", quality: 4.5 },
          seatsAvailable: 5,
          actualEnrollment: 25,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
        {
          crn: 2,
          courseAbbr: "CS",
          courseNumber: "102",
          courseTitle: "Data Structures",
          creditHours: { min: 3, max: 3 },
          campus: { id: 1, abbr: "UGA", description: "Athens" },
          professor: null,
          seatsAvailable: 3,
          actualEnrollment: 27,
          maximumEnrollment: 30,
          cancelled: false,
          lastSeenAt: new Date(),
          academicPeriod: 202401,
          dateRange: { start: "2024-01-08", end: "2024-05-03" },
          meetings: [],
        },
      ];

      const result = professorQuality.score?.(sections, ctx);
      // Only 4.5 is counted (null professor is excluded)
      expect(result).toBe(4.5);
    });
  });
});
