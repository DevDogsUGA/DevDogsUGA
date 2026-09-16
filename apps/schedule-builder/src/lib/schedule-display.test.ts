import { describe, expect, it } from "vitest";
import type { DayOfWeek } from "./domain/section";
import {
  SCHEDULE_START_HOUR,
  SCHEDULE_SPAN_MINUTES,
  toWeekSchedule,
} from "./schedule-display";

type Offering = Parameters<typeof toWeekSchedule>[0][number];

function offering(
  abbr: string,
  crn: number,
  meetings: {
    startTime: string | null;
    endTime: string | null;
    days?: DayOfWeek[];
  }[],
): Offering {
  return {
    crn,
    courseAbbr: abbr,
    courseNumber: "1302",
    courseTitle: "Title",
    creditHours: { min: 3, max: 3 },
    campus: { id: 1, abbr: "ATHENS", description: "Athens" },
    professor: { name: "Ada Lovelace", quality: null },
    seatsAvailable: 5,
    actualEnrollment: 10,
    maximumEnrollment: 20,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202508,
    dateRange: null,
    meetings: meetings.map((m) => ({
      days: m.days ?? ["monday"],
      startTime: m.startTime,
      endTime: m.endTime,
      room: null,
      building: { code: "1", description: "Boyd", lat: null, lon: null },
    })),
  };
}

describe("toWeekSchedule", () => {
  it("puts a space before the meridiem so the time is readable", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [{ startTime: "09:30:00", endTime: "10:45:00" }]),
    ]);

    expect(week.Monday![0]!.timeStart).toBe("9:30 AM");
    expect(week.Monday![0]!.timeEnd).toBe("10:45 AM");
  });

  it("measures the grid offset in minutes from the top of the grid", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [{ startTime: "09:30:00", endTime: "10:45:00" }]),
    ]);

    // 09:30 is 90 minutes after the 08:00 grid start.
    expect(week.Monday![0]!.timeDifference).toBe(90);
  });

  it("places the first grid hour at offset zero", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [
        { startTime: `0${SCHEDULE_START_HOUR}:00:00`, endTime: "08:50:00" },
      ]),
    ]);

    expect(week.Monday![0]!.timeDifference).toBe(0);
  });

  it("spans 8 AM to 10 PM inclusive", () => {
    expect(SCHEDULE_SPAN_MINUTES).toBe(15 * 60);
  });

  it("drops TBA meetings, which have no place on a time grid", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [{ startTime: null, endTime: null }]),
    ]);

    expect(week.Monday).toEqual([]);
  });

  it("gives a lab the same colour as its lecture", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [{ startTime: "09:00:00", endTime: "09:50:00" }]),
      offering("CSCI1302L", 2, [
        { startTime: "11:00:00", endTime: "11:50:00" },
      ]),
    ]);

    const [lecture, lab] = week.Monday!;
    expect(lab!.bgColor).toBe(lecture!.bgColor);
    expect(lab!.borderColor).toBe(lecture!.borderColor);
  });

  it("gives distinct courses distinct colours beyond the fourth", () => {
    // The old render-time palette burned two entries per course and fell back
    // to gray from the fourth course on.
    const week = toWeekSchedule(
      ["AAAA1000", "BBBB1000", "CCCC1000", "DDDD1000", "EEEE1000"].map(
        (abbr, i) =>
          offering(abbr, i, [
            { startTime: `0${8 + i}:00:00`, endTime: `0${8 + i}:50:00` },
          ]),
      ),
    );

    const colors = week.Monday!.map((c) => c.bgColor);
    expect(new Set(colors).size).toBe(5);
    expect(colors).not.toContain("bg-gray-500");
  });

  it("keeps a Saturday-only meeting instead of silently dropping it", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [
        { startTime: "09:30:00", endTime: "10:45:00", days: ["saturday"] },
      ]),
    ]);

    expect(week.Saturday).toBeDefined();
    expect(week.Saturday).toHaveLength(1);
    expect(week.Saturday![0]!.timeStart).toBe("9:30 AM");
    expect(week.Saturday![0]!.currentDay).toBe("S");
  });

  it("keeps a Sunday-only meeting instead of silently dropping it", () => {
    const week = toWeekSchedule([
      offering("CSCI1302", 1, [
        { startTime: "09:30:00", endTime: "10:45:00", days: ["sunday"] },
      ]),
    ]);

    expect(week.Sunday).toBeDefined();
    expect(week.Sunday).toHaveLength(1);
    expect(week.Sunday![0]!.timeStart).toBe("9:30 AM");
    expect(week.Sunday![0]!.currentDay).toBe("U");
  });
});
