import { UsageError } from "@devdogsuga/cli-core/ui";
import { describe, expect, it } from "vitest";
import { pickMeeting, type Meeting } from "./meetings.js";

function meeting(slug: string, title = "Build Session"): Meeting {
  return {
    id: `id-${slug}`,
    slug,
    title,
    startsAt: new Date("2026-10-05T22:00:00Z"),
    endsAt: new Date("2026-10-06T00:00:00Z"),
    cancelledAt: null,
    hasWorkshop: true,
  };
}

describe("pickMeeting", () => {
  it("takes the one meeting on a day", () => {
    expect(pickMeeting("2026-10-05", [meeting("2026-10-05")]).slug).toBe(
      "2026-10-05",
    );
  });

  it("prefers an exact slug over the day's other meeting", () => {
    const both = [meeting("2026-10-05"), meeting("2026-10-05-2", "Social")];
    expect(pickMeeting("2026-10-05-2", both).slug).toBe("2026-10-05-2");
  });

  it("lists both when a day has two meetings and the day was not a slug", () => {
    const both = [meeting("2026-10-05-1"), meeting("2026-10-05-2", "Social")];
    expect(() => pickMeeting("2026-10-05", both)).toThrow(
      /2026-10-05-1 \(Build Session\) or 2026-10-05-2 \(Social\)/,
    );
  });

  it("says how to name one when nothing matches", () => {
    expect(() => pickMeeting("2026-01-01", [])).toThrow(UsageError);
  });
});
