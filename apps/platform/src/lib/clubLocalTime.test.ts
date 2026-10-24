import { describe, expect, it } from "vitest";
import { clubLocalToIso, isoToClubLocal } from "./clubLocalTime";

describe("club local time", () => {
  it("reads 6 PM Eastern in September as 22:00Z", () => {
    expect(clubLocalToIso("2026-09-14T18:00")).toBe("2026-09-14T22:00:00.000Z");
    expect(isoToClubLocal("2026-09-14T22:00:00.000Z")).toBe("2026-09-14T18:00");
  });

  it("follows standard time in winter", () => {
    expect(clubLocalToIso("2026-12-02T18:00")).toBe("2026-12-02T23:00:00.000Z");
    expect(isoToClubLocal("2026-12-02T23:00:00.000Z")).toBe("2026-12-02T18:00");
  });

  it("round-trips either side of the November change", () => {
    for (const local of [
      "2026-11-01T00:30",
      "2026-11-01T03:00",
      "2026-11-02T18:00",
    ]) {
      expect(isoToClubLocal(clubLocalToIso(local)!)).toBe(local);
    }
  });

  it("refuses text that is not a time, and a time that never happens", () => {
    expect(clubLocalToIso("soon")).toBeNull();
    expect(clubLocalToIso("2026-02-30T10:00")).toBeNull();
    expect(clubLocalToIso("2026-03-08T02:30")).toBeNull();
  });

  it("returns an empty string for a bad instant", () => {
    expect(isoToClubLocal("nope")).toBe("");
  });
});
