import { describe, expect, it } from "vitest";
import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import { maxCreditHoursRule, minCreditHoursRule } from "./creditHours";

function section(crn: number, min: number, max: number): Section {
  return {
    crn,
    courseAbbr: "CSCI",
    courseNumber: "1301",
    courseTitle: "Intro to Computing",
    creditHours: { min, max },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 10,
    actualEnrollment: 0,
    maximumEnrollment: 10,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202608,
    dateRange: null,
    meetings: [],
  };
}

function ctx(overrides: Partial<GenerationConstraints> = {}): GenerationConstraints {
  return {
    excludedCourses: [],
    excludedSections: [],
    minCreditHours: 0,
    maxCreditHours: 0,
    showFilledClasses: true,
    ...overrides,
  };
}

describe("maxCreditHoursRule.allowPartialSchedule", () => {
  it("rejects a partial whose minimum possible total exceeds the cap", () => {
    // Fixed-credit sections: min sum is exactly the total, 12 > cap of 10.
    const partial = [section(1, 4, 4), section(2, 4, 4), section(3, 4, 4)];
    const c = ctx({ maxCreditHours: 10 });

    expect(maxCreditHoursRule.allowPartialSchedule!(partial, c)).toBe(false);
  });

  it("allows a partial whose minimum possible total is at or under the cap", () => {
    // Variable-credit section counted at its min: 3 + 3 = 6.
    const partial = [section(1, 3, 3), section(2, 3, 4)];

    expect(
      maxCreditHoursRule.allowPartialSchedule!(partial, ctx({ maxCreditHours: 6 })),
    ).toBe(true);
    expect(
      maxCreditHoursRule.allowPartialSchedule!(partial, ctx({ maxCreditHours: 10 })),
    ).toBe(true);
  });
});

describe("minCreditHoursRule.allowSchedule", () => {
  it("rejects a complete schedule whose maximum possible total is below the floor", () => {
    const complete = [section(1, 1, 1), section(2, 1, 1)]; // max sum 2
    const c = ctx({ minCreditHours: 12 });

    expect(minCreditHoursRule.allowSchedule!(complete, c)).toBe(false);
  });

  it("allows a complete schedule whose maximum possible total is at or above the floor", () => {
    // Variable-credit sections counted at their max: 4 + 4 + 4 = 12.
    const complete = [section(1, 3, 4), section(2, 3, 4), section(3, 3, 4)];

    expect(
      minCreditHoursRule.allowSchedule!(complete, ctx({ minCreditHours: 12 })),
    ).toBe(true);
    expect(
      minCreditHoursRule.allowSchedule!(complete, ctx({ minCreditHours: 10 })),
    ).toBe(true);
  });

  it("does not define allowPartialSchedule, so the engine can never prune early with it", () => {
    expect("allowPartialSchedule" in minCreditHoursRule).toBe(false);
  });
});

describe("monotonicity proof: the max rule safely prunes partials, the min rule never does", () => {
  it("prunes a partial the instant its floor is already over the max cap", () => {
    // Every section fixed at 4 credits: min sum is 12, already past the cap
    // of 10. No matter what else got added, the floor can only go up from
    // here, so it is safe to reject this partial immediately.
    const overCap = [section(1, 4, 4), section(2, 4, 4), section(3, 4, 4)];
    const c = ctx({ maxCreditHours: 10, minCreditHours: 12 });

    expect(maxCreditHoursRule.allowPartialSchedule!(overCap, c)).toBe(false);
  });

  it("never prunes a different partial sitting under the min floor -- it is only rejected once complete", () => {
    // Only one section chosen so far, well under both the (irrelevant) max
    // cap and the min floor. Nothing here may prune it as a partial: more
    // courses could still be added to reach the floor.
    const underFloor = [section(1, 1, 1)];
    const c = ctx({ maxCreditHours: 10, minCreditHours: 12 });

    // maxCreditHoursRule sees plenty of room under the cap.
    expect(maxCreditHoursRule.allowPartialSchedule!(underFloor, c)).toBe(true);
    // minCreditHoursRule has no allowPartialSchedule hook at all -- the
    // engine has no way to call it on a partial in the first place.
    expect("allowPartialSchedule" in minCreditHoursRule).toBe(false);

    // The same sections, now treated as a complete schedule, are correctly
    // rejected by allowSchedule -- proving the floor constraint was real,
    // just deferred until nothing more could be added.
    expect(minCreditHoursRule.allowSchedule!(underFloor, c)).toBe(false);
  });
});
