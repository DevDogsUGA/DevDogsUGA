import { describe, expect, it } from "vitest";
import { reflectionDeadline, reflectionWordCount } from "./policy";

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
});
