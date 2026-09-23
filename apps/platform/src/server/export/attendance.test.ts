import { describe, expect, it } from "vitest";
import {
  type AttendanceRow,
  parseAttendanceFilters,
  projectAttendanceRow,
} from "./attendanceCsv";

const ROW: AttendanceRow = {
  userId: "user-1",
  preferredName: "Sam Rivera",
  email: "sam@uga.edu",
  githubLogin: "samrivera",
  meetingConfigId: "build-session-1",
  meetingTitle: "Build Session",
  meetingStartsAt: new Date("2026-04-10T18:00:00-04:00"),
  checkedInAt: new Date("2026-04-10T18:05:00-04:00"),
  method: "qr",
  countsForCredit: true,
};

describe("projectAttendanceRow", () => {
  it("orders the columns to match ATTENDANCE_COLUMNS and formats timestamps with an offset", () => {
    expect(projectAttendanceRow(ROW)).toEqual([
      "user-1",
      "Sam Rivera",
      "sam@uga.edu",
      "samrivera",
      "build-session-1",
      "Build Session",
      "2026-04-10T22:00:00.000Z",
      "2026-04-10T22:05:00.000Z",
      "qr",
      true,
    ]);
  });

  it("passes nulls through rather than substituting a placeholder", () => {
    const row: AttendanceRow = {
      ...ROW,
      preferredName: null,
      email: null,
      githubLogin: null,
      meetingConfigId: null,
    };
    const projected = projectAttendanceRow(row);
    expect(projected[1]).toBeNull();
    expect(projected[2]).toBeNull();
    expect(projected[3]).toBeNull();
    expect(projected[4]).toBeNull();
  });
});

describe("parseAttendanceFilters", () => {
  it("parses from, to, and meetingId", () => {
    const url = new URL(
      "https://devdogsuga.org/export/attendance?from=2026-01-01&to=2026-05-01&meetingId=abc-123",
    );
    const filters = parseAttendanceFilters(url);
    expect(filters.from).toEqual(new Date("2026-01-01"));
    expect(filters.to).toEqual(new Date("2026-05-01"));
    expect(filters.meetingId).toBe("abc-123");
  });

  it("drops an unparseable date rather than throwing", () => {
    const url = new URL(
      "https://devdogsuga.org/export/attendance?from=not-a-date",
    );
    expect(parseAttendanceFilters(url).from).toBeUndefined();
  });

  it("returns an empty object for no query parameters", () => {
    expect(
      parseAttendanceFilters(
        new URL("https://devdogsuga.org/export/attendance"),
      ),
    ).toEqual({});
  });
});
