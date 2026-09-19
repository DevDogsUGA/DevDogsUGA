import { describe, expect, it } from "vitest";
import { groupRowsIntoSections, type SectionRow } from "./loadSections";

/**
 * A single flat join row with every field defaulted to its "bare offering,
 * no meeting, no instructor" shape. Tests override only what they exercise.
 */
function row(overrides: Partial<SectionRow> = {}): SectionRow {
  return {
    crn: 12345,
    courseAbbr: "CSCI1302",
    courseNumber: "1302",
    courseTitle: "Software Development",
    minCreditHours: 3,
    maxCreditHours: 3,
    campusId: 1,
    campusAbbr: "ATH",
    campusDescription: "Athens",
    instructorId: null,
    instructorFirstName: null,
    instructorLastName: null,
    seatsAvailable: 10,
    actualEnrollment: 20,
    maximumEnrollment: 30,
    cancelled: false,
    lastSeenAt: new Date("2026-01-01T00:00:00Z"),
    academicPeriod: 202608,
    classesBegin: "2026-08-13",
    classesEnd: "2026-12-03",
    meetingId: null,
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
    startTime: null,
    endTime: null,
    room: null,
    buildingId: null,
    buildingDescription: null,
    buildingLatitude: null,
    buildingLongitude: null,
    ...overrides,
  };
}

describe("groupRowsIntoSections", () => {
  it("collapses two rows sharing a crn into one section with two meetings", () => {
    const sections = groupRowsIntoSections([
      row({
        meetingId: 1,
        monday: true,
        startTime: "09:00:00",
        endTime: "09:50:00",
        room: "101",
      }),
      row({
        meetingId: 2,
        wednesday: true,
        startTime: "09:00:00",
        endTime: "09:50:00",
        room: "101",
      }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.crn).toBe(12345);
    expect(sections[0]!.meetings).toHaveLength(2);
    expect(sections[0]!.meetings[0]!.days).toEqual(["monday"]);
    expect(sections[0]!.meetings[1]!.days).toEqual(["wednesday"]);
  });

  it("keeps the same CRN in different academic periods as separate sections", () => {
    const sections = groupRowsIntoSections([
      row({ academicPeriod: 202702, crn: 61019 }),
      row({ academicPeriod: 202705, crn: 61019 }),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.academicPeriod)).toEqual([
      202702, 202705,
    ]);
  });

  it("derives dateRange from the fixture's partsOfTerm columns", () => {
    const [section] = groupRowsIntoSections([
      row({ classesBegin: "2026-08-13", classesEnd: "2026-12-03" }),
    ]);

    expect(section!.dateRange).toEqual({
      start: "2026-08-13",
      end: "2026-12-03",
    });
  });

  it("leaves professor null when the offering has no instructor", () => {
    const [section] = groupRowsIntoSections([row({ instructorId: null })]);

    expect(section!.professor).toBeNull();
  });

  it("gives professor a name with quality always null when an instructor is present", () => {
    const [section] = groupRowsIntoSections([
      row({
        instructorId: 7,
        instructorFirstName: "Ada",
        instructorLastName: "Lovelace",
      }),
    ]);

    expect(section!.professor).toEqual({ name: "Ada Lovelace", quality: null });
  });

  it("yields a null building for a meeting with no building", () => {
    const [section] = groupRowsIntoSections([
      row({ meetingId: 1, monday: true, buildingId: null }),
    ]);

    expect(section!.meetings[0]!.building).toBeNull();
  });

  it("passes building lat/lon through as null when the building has none on file", () => {
    const [section] = groupRowsIntoSections([
      row({
        meetingId: 1,
        monday: true,
        buildingId: 42,
        buildingDescription: "Boyd",
        buildingLatitude: null,
        buildingLongitude: null,
      }),
    ]);

    expect(section!.meetings[0]!.building).toEqual({
      code: "42",
      description: "Boyd",
      lat: null,
      lon: null,
    });
  });
});
