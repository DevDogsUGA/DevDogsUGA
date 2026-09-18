import { describe, expect, it } from "vitest";
import type { Section, Meeting, BuildingLocation } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import { distance } from "./distance";

function buildingWithCoords(
  lat: number | null,
  lon: number | null,
): BuildingLocation {
  return {
    code: "TEST",
    description: "Test Building",
    lat,
    lon,
  };
}

function meetingWithBuilding(building: BuildingLocation | null): Meeting {
  return {
    days: ["monday"],
    startTime: "09:00",
    endTime: "10:00",
    building,
    room: "101",
  };
}

function testSection(crn = 12345, meetings: Meeting[] = []): Section {
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

describe("distance rule", () => {
  const ctx: GenerationConstraints = {
    excludedCourses: [],
    excludedSections: [],
    minCreditHours: 0,
    maxCreditHours: 0,
    showFilledClasses: false,
  };

  it("isActive() returns false unconditionally", () => {
    expect(distance.isActive?.(ctx)).toBe(false);
  });

  it("score does not throw and returns a number when building coords are null", () => {
    const complete = [
      testSection(1, [meetingWithBuilding(null), meetingWithBuilding(null)]),
    ];

    const result = distance.score?.(complete, ctx);
    expect(typeof result).toBe("number");
  });

  it("score returns a number between 0 and 1", () => {
    const complete = [
      testSection(1, [
        meetingWithBuilding(buildingWithCoords(33.94, -83.37)),
        meetingWithBuilding(buildingWithCoords(33.95, -83.36)),
      ]),
    ];

    const result = distance.score?.(complete, ctx);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("does not export allowSection hook", () => {
    expect("allowSection" in distance).toBe(false);
  });

  it("does not export allowSchedule hook", () => {
    expect("allowSchedule" in distance).toBe(false);
  });

  it("does not export allowPartialSchedule hook", () => {
    expect("allowPartialSchedule" in distance).toBe(false);
  });

  it("score returns higher values for closer buildings", () => {
    // Two buildings very close together
    const closeComplete = [
      testSection(1, [
        meetingWithBuilding(buildingWithCoords(33.94, -83.37)),
        meetingWithBuilding(buildingWithCoords(33.9401, -83.3701)),
      ]),
    ];

    // Two buildings far apart (5 miles)
    const farComplete = [
      testSection(1, [
        meetingWithBuilding(buildingWithCoords(33.94, -83.37)),
        meetingWithBuilding(buildingWithCoords(33.84, -83.37)),
      ]),
    ];

    const closeScore = distance.score?.(closeComplete, ctx);
    const farScore = distance.score?.(farComplete, ctx);

    expect(closeScore).toBeGreaterThan(farScore!);
  });

  it("score handles mixed null and valid coordinates", () => {
    const mixed = [
      testSection(1, [
        meetingWithBuilding(buildingWithCoords(33.94, -83.37)),
        meetingWithBuilding(null),
        meetingWithBuilding(buildingWithCoords(33.95, -83.36)),
      ]),
    ];

    const result = distance.score?.(mixed, ctx);
    expect(typeof result).toBe("number");
  });
});
