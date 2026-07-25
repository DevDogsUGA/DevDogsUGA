import { describe, expect, it } from "vitest";
import { academicPeriodInfo, parseDate, parseTime } from "./utils";

describe("parseTime", () => {
  it("converts 12-hour times to 24-hour HH:mm", () => {
    expect(parseTime("10:00 AM")).toBe("10:00");
    expect(parseTime("02:30 PM")).toBe("14:30");
  });

  it("returns null for TBA / empty values", () => {
    expect(parseTime("TBA")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });
});

describe("parseDate", () => {
  it("normalizes M/d/yyyy to yyyy-MM-dd", () => {
    expect(parseDate("1/5/2025")).toBe("2025-01-05");
    expect(parseDate("12/31/2024")).toBe("2024-12-31");
  });

  it("returns null for TBA / empty values", () => {
    expect(parseDate("TBA")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("academicPeriodInfo", () => {
  it("derives the term name and semester from the academic period code", () => {
    expect(academicPeriodInfo(202408)).toEqual({
      description: "Fall 2024",
      semester: "fall",
    });
    expect(academicPeriodInfo(202502)).toEqual({
      description: "Spring 2025",
      semester: "spring",
    });
  });

  it("throws on an invalid period code", () => {
    expect(() => academicPeriodInfo(202401)).toThrow(/Invalid academic period/);
  });
});
