import { describe, expect, it } from "vitest";
import {
  addDays,
  clubDateKey,
  clubWeekStart,
  isDateKey,
  isMonday,
  mondayOf,
  weekRange,
} from "./weeks.js";

describe("club weeks", () => {
  it("names a week by its Monday", () => {
    expect(clubWeekStart(new Date("2026-09-07T16:00:00Z"))).toBe("2026-09-07");
    expect(clubWeekStart(new Date("2026-09-13T16:00:00Z"))).toBe("2026-09-07");
    expect(clubWeekStart(new Date("2026-09-14T16:00:00Z"))).toBe("2026-09-14");
  });

  it("reads the date in Athens time, not UTC", () => {
    // 01:30 UTC Monday is still Sunday evening in Athens (EDT, UTC-4).
    expect(clubDateKey(new Date("2026-09-14T01:30:00Z"))).toBe("2026-09-13");
    expect(clubWeekStart(new Date("2026-09-14T01:30:00Z"))).toBe("2026-09-07");
    // 04:00 UTC is midnight in Athens: Monday has begun.
    expect(clubWeekStart(new Date("2026-09-14T04:00:00Z"))).toBe("2026-09-14");
  });

  it("holds Sunday 23:59 and Monday 00:00 apart in both offsets", () => {
    // EST (UTC-5), after the fall-back on 2026-11-01.
    expect(clubWeekStart(new Date("2026-11-09T04:59:59Z"))).toBe("2026-11-02");
    expect(clubWeekStart(new Date("2026-11-09T05:00:00Z"))).toBe("2026-11-09");
    // EDT (UTC-4) before it.
    expect(clubWeekStart(new Date("2026-10-26T03:59:59Z"))).toBe("2026-10-19");
    expect(clubWeekStart(new Date("2026-10-26T04:00:00Z"))).toBe("2026-10-26");
  });

  it("keeps the DST-change week whole", () => {
    // 2026-11-01 (a 25-hour day) is the Sunday that closes the week of Oct 26.
    expect(clubWeekStart(new Date("2026-11-01T03:59:00Z"))).toBe("2026-10-26");
    expect(clubWeekStart(new Date("2026-11-02T04:59:00Z"))).toBe("2026-10-26");
    expect(clubWeekStart(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
    // Spring forward 2027-03-14 (a 23-hour day), a Sunday.
    expect(clubWeekStart(new Date("2027-03-15T03:59:00Z"))).toBe("2027-03-08");
    expect(clubWeekStart(new Date("2027-03-15T04:00:00Z"))).toBe("2027-03-15");
  });

  it("does civil-date arithmetic across month and year ends", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-03-02", -7)).toBe("2026-02-23");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(isMonday("2026-09-07")).toBe(true);
    expect(isMonday("2026-09-08")).toBe(false);
  });

  it("lists every week between two Mondays", () => {
    expect(weekRange("2026-10-26", "2026-11-16")).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(weekRange("2026-11-16", "2026-11-09")).toEqual([]);
  });

  it("recognises real calendar dates only", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-2-1")).toBe(false);
  });
});
