import { describe, expect, it } from "vitest";
import type { Meeting, Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import {
  preferredEndTimeRule,
  preferredStartTimeRule,
} from "./preferredTimeWindow";

function testMeeting(
  startTime: string | null,
  endTime: string | null,
): Meeting {
  return { days: ["monday"], startTime, endTime, building: null, room: null };
}

function testSection(meetings: Meeting[], crn = 12345): Section {
  return {
    crn,
    courseAbbr: "CSCI",
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
    meetings,
  };
}

function baseCtx(
  overrides: Partial<GenerationConstraints> = {},
): GenerationConstraints {
  return {
    excludedCourses: [],
    excludedSections: [],
    minCreditHours: 0,
    maxCreditHours: 0,
    showFilledClasses: false,
    ...overrides,
  };
}

describe("preferredStartTimeRule", () => {
  it("is inactive when prefStartTime is unset", () => {
    expect(preferredStartTimeRule.isActive?.(baseCtx())).toBe(false);
  });

  it("is active when prefStartTime is set", () => {
    const ctx = baseCtx({ prefStartTime: "09:00" });
    expect(preferredStartTimeRule.isActive?.(ctx)).toBe(true);
  });

  it("allows a section that starts at or after the preferred start", () => {
    const ctx = baseCtx({ prefStartTime: "09:00" });
    const atStart = testSection([testMeeting("09:00", "09:50")]);
    const later = testSection([testMeeting("13:00", "13:50")]);

    expect(preferredStartTimeRule.allowSection!(atStart, ctx)).toBe(true);
    expect(preferredStartTimeRule.allowSection!(later, ctx)).toBe(true);
  });

  it("rejects a section with any meeting before the preferred start", () => {
    const ctx = baseCtx({ prefStartTime: "09:00" });
    const oneEarly = testSection([
      testMeeting("10:00", "10:50"),
      testMeeting("08:00", "08:50"),
    ]);

    expect(preferredStartTimeRule.allowSection!(oneEarly, ctx)).toBe(false);
  });

  it("ignores meetings with no set time", () => {
    const ctx = baseCtx({ prefStartTime: "09:00" });
    const async = testSection([testMeeting(null, null)]);

    expect(preferredStartTimeRule.allowSection!(async, ctx)).toBe(true);
  });
});

describe("preferredEndTimeRule", () => {
  it("is inactive when prefEndTime is unset", () => {
    expect(preferredEndTimeRule.isActive?.(baseCtx())).toBe(false);
  });

  it("is active when prefEndTime is set", () => {
    const ctx = baseCtx({ prefEndTime: "17:00" });
    expect(preferredEndTimeRule.isActive?.(ctx)).toBe(true);
  });

  it("allows a section that ends at or before the preferred end", () => {
    const ctx = baseCtx({ prefEndTime: "17:00" });
    const atEnd = testSection([testMeeting("16:10", "17:00")]);

    expect(preferredEndTimeRule.allowSection!(atEnd, ctx)).toBe(true);
  });

  it("judges a class by when it ends, not when it starts", () => {
    const ctx = baseCtx({ prefEndTime: "17:00" });
    const runsLate = testSection([testMeeting("16:00", "18:30")]);

    expect(preferredEndTimeRule.allowSection!(runsLate, ctx)).toBe(false);
  });

  it("ignores meetings with no set time", () => {
    const ctx = baseCtx({ prefEndTime: "17:00" });
    const async = testSection([testMeeting(null, null)]);

    expect(preferredEndTimeRule.allowSection!(async, ctx)).toBe(true);
  });
});
