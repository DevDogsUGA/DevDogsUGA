import { describe, expect, it } from "vitest";
import { algorithmDriver, dataPreHardFilter } from "./brute-force";
import { Schedule } from "./schedule";
import { computeEndTime, validateHard } from "./schedule-util";
import type {
  AlgorithmClass,
  AlgorithmCourse,
  AlgorithmSection,
  DayOfWeek,
  HConstraints,
  SConstraints,
} from "./types";

const NO_HARD: HConstraints = {
  excludedCourses: [],
  excludedSections: [],
  campus: "Athens",
  minCreditHours: 0,
  maxCreditHours: 0,
  walking: false,
};

const NO_SOFT: SConstraints = { showFilledClasses: true };

function cls(
  startTime: string,
  endTime: string,
  days: DayOfWeek[] = ["MONDAY"],
  coords?: { latitude: number; longitude: number },
): AlgorithmClass {
  return {
    crn: 0,
    days,
    startTime,
    endTime,
    buildingName: "",
    campus: "A",
    buildingNumber: "",
    ...coords,
  };
}

function section(
  courseCode: string,
  crn: number,
  classes: AlgorithmClass[],
  creditHours = { min: 3, max: 3 },
): AlgorithmSection {
  return {
    courseCode,
    crn,
    professor: { name: "TBA", quality: 4 },
    classes,
    creditHours,
  };
}

function course(
  courseCode: string,
  sections: AlgorithmSection[],
): AlgorithmCourse {
  return { courseCode, sections };
}

describe("algorithmDriver", () => {
  it("reports no-courses instead of returning one empty schedule", () => {
    // The old driver produced [[]], which the caller read as a valid plan and
    // saved with an empty CRN list.
    const result = algorithmDriver([], NO_SOFT, NO_HARD);

    expect(result).toEqual({ ok: false, reason: "no-courses" });
  });

  it("refuses more than ten courses rather than running the search", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      course(`C${i}`, [section(`C${i}`, i, [cls("09:00", "09:50")])]),
    );

    const result = algorithmDriver(many, NO_SOFT, NO_HARD);

    expect(result).toEqual({ ok: false, reason: "too-many-courses" });
  });

  it("returns a schedule containing one section per course", () => {
    const result = algorithmDriver(
      [
        course("A", [section("A", 1, [cls("09:00", "09:50")])]),
        course("B", [section("B", 2, [cls("11:00", "11:50")])]),
      ],
      NO_SOFT,
      NO_HARD,
    );

    expect(result).toEqual({ ok: true, schedules: [[1, 2]] });
  });

  it("reports no-schedules when every combination conflicts", () => {
    const result = algorithmDriver(
      [
        course("A", [section("A", 1, [cls("09:00", "09:50")])]),
        course("B", [section("B", 2, [cls("09:30", "10:20")])]),
      ],
      NO_SOFT,
      NO_HARD,
    );

    expect(result).toEqual({ ok: false, reason: "no-schedules" });
  });

  it("keeps every requested course when a preference would drop one", () => {
    // Course B only meets at 08:00, which the 10:00 preference excludes.
    // Preferences must not silently remove a course from the plan.
    const result = algorithmDriver(
      [
        course("A", [section("A", 1, [cls("11:00", "11:50")])]),
        course("B", [section("B", 2, [cls("08:00", "08:50")])]),
      ],
      { ...NO_SOFT, prefStartTime: "10:00" },
      NO_HARD,
    );

    expect(result).toEqual({ ok: true, schedules: [[1, 2]] });
  });

  it("honours excluded sections", () => {
    const result = algorithmDriver(
      [
        course("A", [
          section("A", 1, [cls("09:00", "09:50")]),
          section("A", 2, [cls("13:00", "13:50")]),
        ]),
      ],
      NO_SOFT,
      { ...NO_HARD, excludedSections: [1] },
    );

    expect(result).toEqual({ ok: true, schedules: [[2]] });
  });

  it("honours the maximum credit-hour limit", () => {
    const overCap = [
      course("A", [section("A", 1, [cls("09:00", "09:50")])]),
      course("B", [section("B", 2, [cls("11:00", "11:50")])]),
    ];

    expect(
      algorithmDriver(overCap, NO_SOFT, { ...NO_HARD, maxCreditHours: 4 }),
    ).toEqual({ ok: false, reason: "no-schedules" });

    expect(
      algorithmDriver(overCap, NO_SOFT, { ...NO_HARD, maxCreditHours: 6 }),
    ).toEqual({ ok: true, schedules: [[1, 2]] });
  });

  it("honours the minimum credit-hour limit", () => {
    const single = [course("A", [section("A", 1, [cls("09:00", "09:50")])])];

    expect(
      algorithmDriver(single, NO_SOFT, { ...NO_HARD, minCreditHours: 12 }),
    ).toEqual({ ok: false, reason: "no-schedules" });
  });
});

describe("dataPreHardFilter", () => {
  it("drops excluded courses and excluded sections", () => {
    const filtered = dataPreHardFilter(
      [
        course("A", [
          section("A", 1, [cls("09:00", "09:50")]),
          section("A", 2, [cls("10:00", "10:50")]),
        ]),
        course("B", [section("B", 3, [cls("11:00", "11:50")])]),
      ],
      { ...NO_HARD, excludedCourses: ["B"], excludedSections: [1] },
    );

    expect(filtered.map((c) => c.courseCode)).toEqual(["A"]);
    expect(filtered[0]!.sections.map((s) => s.crn)).toEqual([2]);
  });
});

describe("computeEndTime", () => {
  it("uses the class end time, not its start time", () => {
    const schedule = new Schedule([section("A", 1, [cls("11:00", "12:50")])]);

    expect(computeEndTime(schedule)).toBeCloseTo(12 + 50 / 60);
  });
});

describe("validateHard walking distance", () => {
  const northCampus = { latitude: 33.9575, longitude: -83.375 };
  // ~1.4 miles away — roughly 28 minutes on foot.
  const farAway = { latitude: 33.938, longitude: -83.3675 };

  it("rejects a back-to-back pair that cannot be walked in the gap", () => {
    const schedule = new Schedule([
      section("A", 1, [cls("09:00", "09:50", ["MONDAY"], northCampus)]),
      section("B", 2, [cls("10:00", "10:50", ["MONDAY"], farAway)]),
    ]);

    expect(validateHard(schedule, { ...NO_HARD, walking: true })).toBe(false);
  });

  it("accepts the same pair when the gap is long enough", () => {
    const schedule = new Schedule([
      section("A", 1, [cls("09:00", "09:50", ["MONDAY"], northCampus)]),
      section("B", 2, [cls("13:00", "13:50", ["MONDAY"], farAway)]),
    ]);

    expect(validateHard(schedule, { ...NO_HARD, walking: true })).toBe(true);
  });

  it("ignores the constraint when buildings have no coordinates", () => {
    const schedule = new Schedule([
      section("A", 1, [cls("09:00", "09:50")]),
      section("B", 2, [cls("10:00", "10:50")]),
    ]);

    expect(validateHard(schedule, { ...NO_HARD, walking: true })).toBe(true);
  });
});
