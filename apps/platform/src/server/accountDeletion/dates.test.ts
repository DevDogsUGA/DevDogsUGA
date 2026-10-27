import { describe, expect, it } from "vitest";
import {
  DELETION_WINDOW_DAYS,
  deletionDueAt,
  formatDeletionDate,
} from "./dates";

describe("deletionDueAt", () => {
  it("is exactly fourteen days after scheduling", () => {
    const now = new Date("2026-10-23T15:30:00.000Z");
    expect(DELETION_WINDOW_DAYS).toBe(14);
    expect(deletionDueAt(now).toISOString()).toBe("2026-11-06T15:30:00.000Z");
  });

  it("does not mutate the date it was given", () => {
    const now = new Date("2026-10-23T15:30:00.000Z");
    deletionDueAt(now);
    expect(now.toISOString()).toBe("2026-10-23T15:30:00.000Z");
  });
});

describe("formatDeletionDate", () => {
  it("spells the weekday, month and year out", () => {
    expect(formatDeletionDate(new Date("2026-11-06T15:30:00.000Z"))).toBe(
      "Friday, November 6, 2026",
    );
  });

  it("reads the date in Eastern time, not UTC", () => {
    // 02:00 UTC on the 7th is still the evening of the 6th in Georgia.
    expect(formatDeletionDate(new Date("2026-11-07T02:00:00.000Z"))).toBe(
      "Friday, November 6, 2026",
    );
  });

  it("follows daylight saving", () => {
    expect(formatDeletionDate(new Date("2026-07-04T03:30:00.000Z"))).toBe(
      "Friday, July 3, 2026",
    );
  });
});
