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

  it("scores a schedule fully within the preferred window higher than one outside it", () => {
    const ctx = baseCtx({ prefStartTime: "09:00" });
    const withinWindow = [testSection([testMeeting("09:00", "09:50")])];
    const outsideWindow = [testSection([testMeeting("07:00", "07:50")])];

    const withinScore = preferredStartTimeRule.score!(withinWindow, ctx);
    const outsideScore = preferredStartTimeRule.score!(outsideWindow, ctx);

    expect(withinScore).toBeGreaterThan(outsideScore);
  });

  it("returns a value in [0, 1]", () => {
    const ctx = baseCtx({ prefStartTime: "09:00" });
    const schedule = [testSection([testMeeting("06:00", "06:50")])];
    const score = preferredStartTimeRule.score!(schedule, ctx);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
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

  it("scores a schedule fully within the preferred window higher than one outside it", () => {
    const ctx = baseCtx({ prefEndTime: "17:00" });
    const withinWindow = [testSection([testMeeting("16:00", "16:50")])];
    const outsideWindow = [testSection([testMeeting("19:00", "19:50")])];

    const withinScore = preferredEndTimeRule.score!(withinWindow, ctx);
    const outsideScore = preferredEndTimeRule.score!(outsideWindow, ctx);

    expect(withinScore).toBeGreaterThan(outsideScore);
  });

  it("scores by the class's end time, not its start time", () => {
    // A class that STARTS early but runs long, ending after the preferred
    // end time, must still be penalized like any late-ending class — the
    // end-time preference cares about when class lets out, not when it
    // begins. Ports the old schedule-util.ts `computeEndTime` behavior of
    // reading `cls.endTime`, never `cls.startTime`.
    const ctx = baseCtx({ prefEndTime: "17:00" });
    const earlyStartLateEnd = [testSection([testMeeting("08:00", "19:00")])];
    const lateStartEarlyEnd = [testSection([testMeeting("16:00", "16:50")])];

    const earlyStartLateEndScore = preferredEndTimeRule.score!(
      earlyStartLateEnd,
      ctx,
    );
    const lateStartEarlyEndScore = preferredEndTimeRule.score!(
      lateStartEarlyEnd,
      ctx,
    );

    expect(lateStartEarlyEndScore).toBeGreaterThan(earlyStartLateEndScore);
  });

  it("returns a value in [0, 1]", () => {
    const ctx = baseCtx({ prefEndTime: "17:00" });
    const schedule = [testSection([testMeeting("20:00", "23:00")])];
    const score = preferredEndTimeRule.score!(schedule, ctx);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("regression: soft time preferences never hard-exclude a schedule", () => {
  it("scores, rather than excludes, a schedule containing an out-of-preference section", () => {
    // Old behavior (../../algorithm/brute-force.ts `getValidSections`): any
    // section whose class started before prefStartTime or ended after
    // prefEndTime was dropped from the candidate pool *before* the search
    // ever ran, silently restricting generation to only preferred sections
    // — a schedulable set of courses could come back as "no valid
    // schedules" over a preference. Neither rule here defines
    // `allowSection`, `allowPartialSchedule`, or `allowSchedule`, so the
    // engine's rule fan-out (see ../engine.ts) can never reject a schedule
    // for this reason: `score` just returns a lower number for it. This is
    // the intended behavior change — a schedule is still VALID even when
    // it doesn't match the time-of-day preference at all.
    expect("allowSection" in preferredStartTimeRule).toBe(false);
    expect("allowPartialSchedule" in preferredStartTimeRule).toBe(false);
    expect("allowSchedule" in preferredStartTimeRule).toBe(false);
    expect("allowSection" in preferredEndTimeRule).toBe(false);
    expect("allowPartialSchedule" in preferredEndTimeRule).toBe(false);
    expect("allowSchedule" in preferredEndTimeRule).toBe(false);

    const ctx = baseCtx({ prefStartTime: "09:00", prefEndTime: "17:00" });
    const outOfPreference = [testSection([testMeeting("06:00", "19:00")])];

    expect(typeof preferredStartTimeRule.score!(outOfPreference, ctx)).toBe(
      "number",
    );
    expect(typeof preferredEndTimeRule.score!(outOfPreference, ctx)).toBe(
      "number",
    );
  });
});
