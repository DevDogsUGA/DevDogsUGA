import { describe, expect, it } from "vitest";
import type { DayOfWeek, Meeting, Section } from "../domain/section";
import type { GenerationConstraints } from "./constraints";
import { diagnoseNoSchedules } from "./diagnose";
import type { GenerationCourse } from "./engine";

// Runs against the real rule registry: the point is that each shipped hard
// rule explains itself in the user's terms.

const CTX: GenerationConstraints = {
  excludedCourses: [],
  excludedSections: [],
  minCreditHours: 0,
  maxCreditHours: 0,
  showFilledClasses: true,
};

function meeting(
  startTime: string,
  endTime: string,
  days: DayOfWeek[] = ["monday"],
): Meeting {
  return { days, startTime, endTime, building: null, room: null };
}

function section(
  crn: number,
  courseAbbr: string,
  courseNumber: string,
  meetings: Meeting[],
  overrides: Partial<Section> = {},
): Section {
  return {
    crn,
    courseAbbr,
    courseNumber,
    courseTitle: "Test",
    creditHours: { min: 3, max: 3 },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 10,
    actualEnrollment: 0,
    maximumEnrollment: 10,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202608,
    dateRange: { start: "2026-01-08", end: "2026-05-01" },
    meetings,
    ...overrides,
  };
}

function course(sections: Section[]): GenerationCourse {
  return { courseCode: sections[0]!.courseAbbr, sections };
}

const chem = (crn: number, m: Meeting[], o: Partial<Section> = {}) =>
  section(crn, "CHEM1211L", "1211L", m, o);
const math = (crn: number, m: Meeting[], o: Partial<Section> = {}) =>
  section(crn, "MATH2250", "2250", m, o);

describe("diagnoseNoSchedules", () => {
  it("names the course whose sections all end too late", () => {
    const courses = [
      course([
        chem(1, [meeting("16:00", "18:00")]),
        chem(2, [meeting("17:30", "19:00")]),
      ]),
      course([math(3, [meeting("09:00", "09:50", ["tuesday"])])]),
    ];

    expect(
      diagnoseNoSchedules(courses, { ...CTX, prefEndTime: "17:00" }),
    ).toEqual(["No section of CHEM 1211L ends by 5 PM."]);
  });

  it("names the start-time bound with minutes", () => {
    const courses = [course([math(1, [meeting("08:00", "08:50")])])];

    expect(
      diagnoseNoSchedules(courses, { ...CTX, prefStartTime: "09:30" }),
    ).toEqual(["No section of MATH 2250 starts at or after 9:30 AM."]);
  });

  it("reports every emptied course", () => {
    const courses = [
      course([chem(1, [meeting("18:00", "19:00")])]),
      course([math(2, [meeting("19:00", "20:00")])]),
    ];

    expect(
      diagnoseNoSchedules(courses, { ...CTX, prefEndTime: "17:00" }),
    ).toEqual([
      "No section of CHEM 1211L ends by 5 PM.",
      "No section of MATH 2250 ends by 5 PM.",
    ]);
  });

  it("combines requirements when different rules reject different sections", () => {
    const courses = [
      course([
        chem(1, [meeting("18:00", "19:00")]),
        chem(2, [meeting("09:00", "10:00")], {
          campus: { id: 2, abbr: "GWN", description: "Gwinnett" },
        }),
      ]),
    ];

    expect(
      diagnoseNoSchedules(courses, {
        ...CTX,
        prefEndTime: "17:00",
        campusId: 1,
      }),
    ).toEqual([
      "No section of CHEM 1211L ends by 5 PM and is on the selected campus.",
    ]);
  });

  it("explains excluded sections", () => {
    const courses = [course([chem(1, [meeting("09:00", "10:00")])])];

    expect(
      diagnoseNoSchedules(courses, { ...CTX, excludedSections: [1] }),
    ).toEqual([
      "No section of CHEM 1211L remains after your excluded sections.",
    ]);
  });

  it("points at the credit-hour cap when only it blocks every combination", () => {
    const courses = [
      course([chem(1, [meeting("09:00", "09:50")])]),
      course([math(2, [meeting("11:00", "11:50")])]),
    ];

    const [message] = diagnoseNoSchedules(courses, {
      ...CTX,
      maxCreditHours: 4,
    });

    expect(message).toContain("your maximum of 4 credit hours");
  });

  it("points at the credit-hour minimum", () => {
    const courses = [course([chem(1, [meeting("09:00", "09:50")])])];

    const [message] = diagnoseNoSchedules(courses, {
      ...CTX,
      minCreditHours: 12,
    });

    expect(message).toContain("your minimum of 12 credit hours");
  });

  it("names the colliding pair when courses overlap with no constraint to relax", () => {
    const courses = [
      course([chem(1, [meeting("09:00", "09:50")])]),
      course([math(2, [meeting("09:30", "10:20")])]),
    ];

    expect(diagnoseNoSchedules(courses, CTX)).toEqual([
      "Every available section of CHEM 1211L overlaps every available section of MATH 2250. Drop one of them or allow more sections.",
    ]);
  });

  it("suggests relaxing the time window when it forces the collision", () => {
    const courses = [
      course([
        chem(1, [meeting("09:00", "09:50")]),
        chem(2, [meeting("18:00", "18:50")]),
      ]),
      course([math(3, [meeting("09:30", "10:20")])]),
    ];

    const [message] = diagnoseNoSchedules(courses, {
      ...CTX,
      prefEndTime: "17:00",
    });

    expect(message).toContain("your 5 PM latest end time");
  });
});
