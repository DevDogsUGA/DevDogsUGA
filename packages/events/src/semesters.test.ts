import { describe, expect, it } from "vitest";
import {
  getClubConfig,
  getSemesters,
  semesterWeeks,
  semestersConfigSchema,
  validateSemesters,
  type SemestersConfig,
} from "./index.js";

const meet = (startsAt: string, cancelledAt: string | null = null) => ({
  startsAt,
  cancelledAt,
});

const FALL = { from: "2026-08-10", to: "2026-12-31" };

function config(art: SemestersConfig["semesters"][number]["art"]) {
  return semestersConfigSchema.parse({
    emptyWeeks: "frost",
    semesters: [{ id: "fall-2026", label: "Fall 2026", ...FALL, art }],
  });
}

describe("semesterWeeks", () => {
  it("runs from the first meeting's week to the last, gaps included", () => {
    const weeks = semesterWeeks(FALL, [
      meet("2026-09-09T22:00:00Z"),
      meet("2026-09-30T22:00:00Z"),
    ]);
    expect(weeks).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("ignores cancelled meetings and meetings outside the window", () => {
    expect(
      semesterWeeks(FALL, [
        meet("2026-09-09T22:00:00Z"),
        meet("2026-11-30T23:00:00Z", "2026-10-10T22:00:00Z"),
        meet("2027-01-20T23:00:00Z"),
        meet("2026-05-01T23:00:00Z"),
      ]),
    ).toEqual(["2026-09-07"]);
  });

  it("puts a Sunday-night meeting in its own Athens week", () => {
    // 02:00 UTC Monday is Sunday 22:00 in Athens.
    expect(semesterWeeks(FALL, [meet("2026-09-14T02:00:00Z")])).toEqual([
      "2026-09-07",
    ]);
  });

  it("is empty when nothing meets", () => {
    expect(semesterWeeks(FALL, [])).toEqual([]);
  });
});

describe("validateSemesters", () => {
  const meetings = [meet("2026-09-09T22:00:00Z"), meet("2026-09-17T22:00:00Z")];
  const lines = ["ooo ooo", "(_) (_)"];
  const good = {
    lines,
    regions: {
      "2026-09-07": [[0, 0, 3]],
      "2026-09-14": [[0, 4, 3]],
    },
  };

  it("accepts art that covers exactly the semester's weeks", () => {
    expect(validateSemesters(config(good as never), meetings)).toEqual([]);
  });

  it("accepts a semester with no art", () => {
    expect(validateSemesters(config(undefined), meetings)).toEqual([]);
  });

  it("rejects a week with no region", () => {
    const issues = validateSemesters(
      config({ lines, regions: { "2026-09-07": [[0, 0, 3]] } }),
      meetings,
    );
    expect(issues.map((i) => i.message).join()).toMatch(
      /no region for week 2026-09-14/,
    );
  });

  it("rejects a region for a week outside the meetings", () => {
    const issues = validateSemesters(
      config({
        lines,
        regions: { ...good.regions, "2026-09-21": [[1, 0, 3]] },
      } as never),
      meetings,
    );
    expect(issues.map((i) => i.message).join()).toMatch(/2026-09-21/);
  });

  it("rejects a week that is not a Monday", () => {
    const issues = validateSemesters(
      config({
        lines,
        regions: { "2026-09-08": [[0, 0, 3]], "2026-09-14": [[0, 4, 3]] },
      }),
      meetings,
    );
    expect(issues.map((i) => i.message).join()).toMatch(/not a Monday/);
  });

  it("rejects spans that run off the picture or onto blanks", () => {
    const off = validateSemesters(
      config({
        lines,
        regions: { ...good.regions, "2026-09-14": [[0, 4, 9]] },
      }),
      meetings,
    );
    expect(off.map((i) => i.message).join()).toMatch(/past the end/);
    const blank = validateSemesters(
      config({
        lines,
        regions: { ...good.regions, "2026-09-14": [[0, 3, 1]] },
      }),
      meetings,
    );
    expect(blank.map((i) => i.message).join()).toMatch(/blank/);
    const missingLine = validateSemesters(
      config({
        lines,
        regions: { ...good.regions, "2026-09-14": [[5, 0, 1]] },
      }),
      meetings,
    );
    expect(missingLine.map((i) => i.message).join()).toMatch(/line 5/);
  });

  it("rejects two weeks claiming one character", () => {
    const issues = validateSemesters(
      config({
        lines: ["oooooo"],
        regions: { "2026-09-07": [[0, 0, 3]], "2026-09-14": [[0, 2, 3]] },
      }),
      meetings,
    );
    expect(issues.map((i) => i.message).join()).toMatch(/both claim/);
  });

  it("rejects duplicate ids and overlapping windows", () => {
    const issues = validateSemesters(
      semestersConfigSchema.parse({
        emptyWeeks: "omit",
        semesters: [
          { id: "a", label: "A", from: "2026-08-01", to: "2026-12-31" },
          { id: "a", label: "B", from: "2026-12-01", to: "2027-05-01" },
        ],
      }),
      [],
    );
    const text = issues.map((i) => i.message).join(" ");
    expect(text).toMatch(/used twice/);
    expect(text).toMatch(/overlaps/);
  });

  it("only accepts the two empty-week treatments", () => {
    expect(
      semestersConfigSchema.safeParse({ emptyWeeks: "hide", semesters: [] })
        .success,
    ).toBe(false);
  });
});

describe("the committed semesters", () => {
  it("validate against the committed meetings", () => {
    expect(() => getSemesters()).not.toThrow();
  });

  it("ship Fall 2026 art with one region per meeting week", () => {
    const fall = getSemesters().semesters.find((s) => s.id === "fall-2026");
    expect(fall?.art).toBeDefined();
    const weeks = semesterWeeks(fall!, getClubConfig().meetings);
    expect(Object.keys(fall!.art!.regions).sort()).toEqual(weeks);
  });
});
