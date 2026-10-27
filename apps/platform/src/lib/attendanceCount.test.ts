import { describe, expect, it } from "vitest";
import { formatAttendanceCount } from "./attendanceCount";

describe("formatAttendanceCount", () => {
  it("splits members from officers", () => {
    expect(formatAttendanceCount({ total: 12, officers: 3 })).toBe(
      "12 attended · 9 members + 3 officers",
    );
  });

  it("uses singular nouns and a plain zero", () => {
    expect(formatAttendanceCount({ total: 2, officers: 1 })).toBe(
      "2 attended · 1 member + 1 officer",
    );
    expect(formatAttendanceCount({ total: 0, officers: 0 })).toBe("0 attended");
  });
});
