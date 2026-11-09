import { describe, expect, it } from "vitest";
import { meetingBadges, primaryBadge } from "./meetingView";

describe("meetingBadges", () => {
  it("shows the category of a night with no workshops", () => {
    expect(
      meetingBadges({ category: "social", segments: [] }).map((b) => b.label),
    ).toEqual(["Social"]);
  });

  it("reads a null category as a build night", () => {
    expect(meetingBadges({ category: null }).map((b) => b.label)).toEqual([
      "Build",
    ]);
  });

  it("does not print Workshop twice for a workshop night", () => {
    expect(
      meetingBadges({ category: "workshop", segments: ["workshop"] }).map(
        (b) => b.label,
      ),
    ).toEqual(["Workshop"]);
  });

  it("keeps the workshop chip beside another category", () => {
    expect(
      meetingBadges({ category: "build", segments: ["workshop"] }).map(
        (b) => b.label,
      ),
    ).toEqual(["Workshop", "Build"]);
  });

  it("draws the category's dot for the calendar", () => {
    expect(primaryBadge({ category: "info", segments: [] }).dot).toBe(
      "bg-violet-500",
    );
  });
});
