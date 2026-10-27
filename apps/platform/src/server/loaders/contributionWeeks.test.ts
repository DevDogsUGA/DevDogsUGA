import { describe, expect, it } from "vitest";
import { countMergesByWeek } from "./contributionWeeks";

describe("countMergesByWeek", () => {
  it("folds merges into club weeks, oldest first", () => {
    expect(
      countMergesByWeek([
        new Date("2026-10-20T16:00:00Z"),
        new Date("2026-10-13T16:00:00Z"),
        new Date("2026-10-12T16:00:00Z"),
      ]),
    ).toEqual([
      { week: "2026-10-12", merged: 2 },
      { week: "2026-10-19", merged: 1 },
    ]);
  });

  it("puts Sunday night in the week that is ending, in club time", () => {
    // 2026-10-19T02:00Z is still Sunday Oct 18 in Eastern time.
    expect(countMergesByWeek([new Date("2026-10-19T02:00:00Z")])).toEqual([
      { week: "2026-10-12", merged: 1 },
    ]);
  });

  it("is empty for no merges", () => {
    expect(countMergesByWeek([])).toEqual([]);
  });
});
