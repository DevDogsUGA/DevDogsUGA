import { describe, expect, it } from "vitest";
import { consoleSectionFor } from "./consoleSection";

describe("consoleSectionFor", () => {
  it("finds the section a path belongs to, nested paths included", () => {
    expect(consoleSectionFor("/console/audit-log")?.label).toBe("Audit Log");
    expect(consoleSectionFor("/console/audit-log?page=2")?.label).toBe(
      "Audit Log",
    );
    expect(consoleSectionFor("/console/attendance/abc/present")?.label).toBe(
      "Attendance",
    );
  });

  it("owns nothing outside the console's sections", () => {
    expect(consoleSectionFor("/console/audit-logs")).toBeNull();
    expect(consoleSectionFor("/console")).toBeNull();
    expect(consoleSectionFor(null)).toBeNull();
  });
});
