import { describe, expect, it } from "vitest";
import {
  reflectionDeadline,
  reflectionWindowStart,
  reflectionWordCount,
} from "./policy";

describe("reflection policy", () => {
  it("counts words across whitespace without counting blank content", () => {
    expect(reflectionWordCount("  one\n two\tthree  ")).toBe(3);
    expect(reflectionWordCount(" \n\t ")).toBe(0);
  });

  it("sets the deadline in exact 24-hour days from the activity end", () => {
    const end = new Date("2026-09-08T23:30:00.000Z");
    expect(reflectionDeadline(end, 7).toISOString()).toBe(
      "2026-09-15T23:30:00.000Z",
    );
  });

  it("opens the window at the later of the meeting's end and the attendance record", () => {
    const end = new Date("2026-09-08T23:30:00.000Z");
    const early = new Date("2026-09-08T20:00:00.000Z");
    const late = new Date("2026-09-12T10:00:00.000Z");
    expect(reflectionWindowStart(end, early)).toBe(end);
    expect(reflectionWindowStart(end, late)).toBe(late);
    // A member added three days after the meeting still gets a full week.
    expect(
      reflectionDeadline(reflectionWindowStart(end, late), 7).toISOString(),
    ).toBe("2026-09-19T10:00:00.000Z");
  });
});
