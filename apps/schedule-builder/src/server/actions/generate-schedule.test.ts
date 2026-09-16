import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DateRange, Meeting, Section } from "~/lib/domain/section";

// `~/server/db`'s `db` export triggers `~/env`'s `createEnv()` at module
// load (see `loadSections.ts`'s doc comment), which throws outside a real
// Next.js/Worker environment. The action only ever uses `db` for the
// campus/excluded-course lookups exercised below, so a minimal chainable
// stub is enough — no real Postgres connection required.
function emptyChain() {
  const rows: unknown[] = [];
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    limit: (n: number) => Promise<unknown[]>;
  };
  promise.limit = () => Promise.resolve(rows);
  return promise;
}

vi.mock("~/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => emptyChain(),
      }),
    }),
  },
}));

const mockLoadSections = vi.fn();
vi.mock("~/lib/domain/loadSections", () => ({
  loadSections: (...args: unknown[]) =>
    mockLoadSections(...args) as Promise<Section[]>,
}));

const { getRecommendedSchedules } = await import("./generate-schedule");
const { filterUsableSections, groupSectionsByCourse } =
  await import("~/lib/generation/prepareCourses");

const FULL_TERM: DateRange = { start: "2026-01-08", end: "2026-05-01" };
// Two real, non-overlapping UGA summer sessions: Maymester ends well before
// the second summer session begins.
const MAYMESTER: DateRange = { start: "2026-05-11", end: "2026-06-05" };
const SECOND_SUMMER: DateRange = { start: "2026-06-29", end: "2026-08-01" };

function meeting(
  startTime: string,
  endTime: string,
  days: Meeting["days"] = ["monday"],
): Meeting {
  return { days, startTime, endTime, building: null, room: null };
}

function section(overrides: Partial<Section> = {}): Section {
  return {
    crn: 12345,
    courseAbbr: "CSCI1301",
    courseNumber: "1301",
    courseTitle: "Intro to Computing",
    creditHours: { min: 3, max: 3 },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 10,
    actualEnrollment: 0,
    maximumEnrollment: 10,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202605,
    dateRange: FULL_TERM,
    meetings: [meeting("09:00", "09:50")],
    ...overrides,
  };
}

beforeEach(() => {
  mockLoadSections.mockReset();
});

describe("filterUsableSections", () => {
  it("drops cancelled sections", () => {
    const active = section({ crn: 1, cancelled: false });
    const cancelled = section({ crn: 2, cancelled: true });

    expect(filterUsableSections([active, cancelled], true)).toEqual([active]);
  });

  it("drops filled sections when showFilledClasses is false", () => {
    const open = section({ crn: 1, seatsAvailable: 5 });
    const filled = section({ crn: 2, seatsAvailable: 0 });

    expect(filterUsableSections([open, filled], false)).toEqual([open]);
  });

  it("keeps filled sections when showFilledClasses is true", () => {
    const filled = section({ crn: 2, seatsAvailable: 0 });

    expect(filterUsableSections([filled], true)).toEqual([filled]);
  });
});

describe("groupSectionsByCourse", () => {
  it("groups sections into one GenerationCourse per distinct courseAbbr", () => {
    const a1 = section({ crn: 1, courseAbbr: "CSCI1301" });
    const a2 = section({ crn: 2, courseAbbr: "CSCI1301" });
    const b1 = section({ crn: 3, courseAbbr: "MATH1113" });

    expect(groupSectionsByCourse([a1, a2, b1])).toEqual([
      { courseCode: "CSCI1301", sections: [a1, a2] },
      { courseCode: "MATH1113", sections: [b1] },
    ]);
  });

  it("returns an empty array for no sections", () => {
    expect(groupSectionsByCourse([])).toEqual([]);
  });
});

describe("getRecommendedSchedules", () => {
  it("returns an error without querying anything when no courses are selected", async () => {
    const result = await getRecommendedSchedules({
      academicPeriod: 202605,
      inputCourseNumbers: [],
      excludedSectionCrns: [],
      excludedCourseIDs: [],
      prefStartTime: 0,
      prefEndTime: 0,
      inputCampus: "",
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: true,
    });

    expect(result.data).toEqual([]);
    expect(result.error).toBeDefined();
    expect(mockLoadSections).not.toHaveBeenCalled();
  });

  // THE KEY TEST: proves the date-range fix to `noConflicts` end to end
  // through the server action, not just inside the engine's own unit tests.
  // Maymester and the second summer session never run at the same time of
  // year, so two sections that share a weekday and time-of-day — but belong
  // to those disjoint terms — must still be allowed into the SAME schedule.
  // Before the fix, a weekday+time-only conflict check would have wrongly
  // flagged them as colliding and the engine would report `no-schedules`.
  it("allows a Maymester section and a second-summer-session section with the same weekday/time into one schedule", async () => {
    const maymesterSection = section({
      crn: 11111,
      courseAbbr: "CSCI1301",
      dateRange: MAYMESTER,
      meetings: [meeting("09:00", "09:50", ["monday"])],
    });
    const secondSummerSection = section({
      crn: 22222,
      courseAbbr: "MATH1113",
      dateRange: SECOND_SUMMER,
      meetings: [meeting("09:00", "09:50", ["monday"])],
    });

    mockLoadSections.mockResolvedValue([maymesterSection, secondSummerSection]);

    const result = await getRecommendedSchedules({
      academicPeriod: 202605,
      inputCourseNumbers: ["CSCI1301", "MATH1113"],
      excludedSectionCrns: [],
      excludedCourseIDs: [],
      prefStartTime: 0,
      prefEndTime: 0,
      inputCampus: "",
      minCreditHours: 0,
      maxCreditHours: 0,
      showFilledClasses: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(expect.arrayContaining([11111, 22222]));
    expect(result.data[0]).toHaveLength(2);
  });
});
