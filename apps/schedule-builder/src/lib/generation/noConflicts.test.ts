import { describe, expect, it } from "vitest";
import type { DateRange, DayOfWeek, Meeting, Section } from "../domain/section";
import { meetingsConflict, noConflicts, sectionsConflict } from "./noConflicts";

function meeting(
  startTime: string | null,
  endTime: string | null,
  days: DayOfWeek[] = ["monday"],
): Meeting {
  return { days, startTime, endTime, building: null, room: null };
}

function section(
  crn: number,
  meetings: Meeting[],
  dateRange: DateRange | null = { start: "2026-01-01", end: "2026-05-01" },
): Section {
  return {
    crn,
    courseAbbr: "CSCI",
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
    academicPeriod: 202608,
    dateRange,
    meetings,
  };
}

const FULL_TERM: DateRange = { start: "2026-01-08", end: "2026-05-01" };
// Disjoint from FULL_TERM — this is the "second summer session vs. Maymester"
// shape that caused the original summer scheduling bug: same weekday, same
// time of day, but the two sections never actually run at the same time.
const MAYMESTER: DateRange = { start: "2026-05-11", end: "2026-05-29" };
const SECOND_SUMMER: DateRange = { start: "2026-06-15", end: "2026-07-31" };

describe("meetingsConflict / sectionsConflict", () => {
  it("conflicts when weekday, time, and date range all overlap", () => {
    const a = section(1, [meeting("09:00", "09:50", ["monday"])], FULL_TERM);
    const b = section(2, [meeting("09:30", "10:20", ["monday"])], FULL_TERM);

    expect(sectionsConflict(a, b)).toBe(true);
    expect(noConflicts([a, b])).toBe(false);
  });

  it("does NOT conflict when weekday and time overlap but date ranges are disjoint (summer-bug regression)", () => {
    // A weekday+time-only comparison (the pre-fix behaviour) would say these
    // two conflict: same day, overlapping time-of-day. They don't, because a
    // Maymester section and a second-summer-session section never run
    // concurrently. This is the exact shape of the historical summer bug —
    // if the date-range term were ever dropped from `meetingsConflict`, this
    // assertion would flip to `true` and fail.
    const a = section(1, [meeting("09:00", "09:50", ["monday"])], MAYMESTER);
    const b = section(
      2,
      [meeting("09:30", "10:20", ["monday"])],
      SECOND_SUMMER,
    );

    expect(sectionsConflict(a, b)).toBe(false);
    expect(noConflicts([a, b])).toBe(true);
  });

  it("never conflicts when the meetings fall on different weekdays", () => {
    const a = section(1, [meeting("09:00", "09:50", ["monday"])], FULL_TERM);
    const b = section(2, [meeting("09:00", "09:50", ["tuesday"])], FULL_TERM);

    expect(sectionsConflict(a, b)).toBe(false);
    expect(noConflicts([a, b])).toBe(true);
  });

  it("does not conflict when time-of-day ranges are merely back-to-back", () => {
    const a = section(1, [meeting("09:00", "09:50", ["monday"])], FULL_TERM);
    const b = section(2, [meeting("09:50", "10:40", ["monday"])], FULL_TERM);

    expect(sectionsConflict(a, b)).toBe(false);
  });

  it("treats a null-timed meeting as occupying no slot", () => {
    // An async/TBA meeting has no fixed time, so it can never collide with
    // anything else, even on the same weekday.
    const a = section(1, [meeting(null, null, ["monday"])], FULL_TERM);
    const b = section(2, [meeting("09:00", "09:50", ["monday"])], FULL_TERM);

    expect(sectionsConflict(a, b)).toBe(false);
  });

  it("fails safe (assumes overlap) when a section's date range is null", () => {
    // A null dateRange is a should-be-impossible data anomaly (failed join),
    // not a legitimate "no term" case. We'd rather over-flag a conflict than
    // silently let a broken join hide a real double-booking.
    const a = section(1, [meeting("09:00", "09:50", ["monday"])], null);
    const b = section(2, [meeting("09:30", "10:20", ["monday"])], FULL_TERM);

    expect(sectionsConflict(a, b)).toBe(true);
  });

  it("meetingsConflict is the underlying meeting-pair primitive", () => {
    const am = meeting("09:00", "09:50", ["monday"]);
    const bm = meeting("09:30", "10:20", ["monday"]);

    expect(
      meetingsConflict(
        { meeting: am, dateRange: FULL_TERM },
        { meeting: bm, dateRange: FULL_TERM },
      ),
    ).toBe(true);
    expect(
      meetingsConflict(
        { meeting: am, dateRange: MAYMESTER },
        { meeting: bm, dateRange: SECOND_SUMMER },
      ),
    ).toBe(false);
  });
});

describe("noConflicts over a full schedule", () => {
  it("is true for an empty or single-section schedule", () => {
    expect(noConflicts([])).toBe(true);
    expect(
      noConflicts([section(1, [meeting("09:00", "09:50")], FULL_TERM)]),
    ).toBe(true);
  });

  it("is false as soon as any one pair among several sections conflicts", () => {
    const a = section(1, [meeting("09:00", "09:50", ["monday"])], FULL_TERM);
    const b = section(2, [meeting("11:00", "11:50", ["monday"])], FULL_TERM);
    const c = section(3, [meeting("09:30", "10:00", ["monday"])], FULL_TERM);

    expect(noConflicts([a, b, c])).toBe(false);
  });
});
