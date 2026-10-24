import { describe, expect, it } from "vitest";
import {
  canReviewReport,
  easternDay,
  isQuarterHours,
  parseRepos,
  reportProblem,
} from "./policy";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const base = {
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  content: words(100),
};

describe("parseRepos", () => {
  it("takes owner/name, URLs and .git suffixes, one way or the other", () => {
    expect(
      parseRepos(
        "DevDogsUGA/DogDays, https://github.com/DevDogsUGA/DogPack.git\ndevdogsuga/dogdays",
      ),
    ).toEqual({ ok: true, repos: ["DevDogsUGA/DogDays", "DevDogsUGA/DogPack"] });
  });
  it("allows none", () => {
    expect(parseRepos("  ")).toEqual({ ok: true, repos: [] });
  });
  it("names what it cannot read", () => {
    expect(parseRepos("just-a-name")).toEqual({
      ok: false,
      message: '"just-a-name" is not an owner/name repository.',
    });
  });
  it("caps the list", () => {
    const many = Array.from({ length: 11 }, (_, i) => `o/r${i}`).join(" ");
    expect(parseRepos(many).ok).toBe(false);
  });
});

describe("reportProblem", () => {
  const today = "2026-10-24";
  it("accepts a whole report", () => {
    expect(reportProblem(base, today)).toBeNull();
  });
  it("wants 100 words, not 99", () => {
    expect(reportProblem({ ...base, content: words(99) }, today)).toBe(
      "too_short",
    );
    expect(reportProblem({ ...base, content: `  ${words(100)}\n` }, today)).toBeNull();
  });
  it("refuses backwards, future and year-long ranges", () => {
    expect(
      reportProblem({ ...base, startDate: "2026-10-15" }, today),
    ).toBe("bad_dates");
    expect(reportProblem({ ...base, endDate: "2026-10-25" }, today)).toBe(
      "future",
    );
    expect(
      reportProblem({ ...base, startDate: "2025-10-01" }, today),
    ).toBe("range_too_long");
    expect(reportProblem({ ...base, endDate: "nope" }, today)).toBe(
      "bad_dates",
    );
  });
  it("wants quarter hours between 0 and 200", () => {
    for (const hours of [0, -1, 0.1, 201, Number.NaN]) {
      expect(reportProblem({ ...base, hours }, today)).toBe("bad_hours");
    }
    expect(reportProblem({ ...base, hours: 0.25 }, today)).toBeNull();
    expect(isQuarterHours(1.75)).toBe(true);
  });
});

describe("canReviewReport", () => {
  const advisor = { userId: "a", isOfficer: false, advisorId: "a" };
  it("lets the advisor and leadership review someone else's report", () => {
    expect(canReviewReport(advisor, "m")).toBe("yes");
    expect(
      canReviewReport({ userId: "o", isOfficer: true, advisorId: null }, "m"),
    ).toBe("yes");
  });
  it("never lets anyone review their own", () => {
    expect(canReviewReport(advisor, "a")).toBe("own_report");
    expect(
      canReviewReport({ userId: "o", isOfficer: true, advisorId: null }, "o"),
    ).toBe("own_report");
  });
  it("turns everyone else away", () => {
    expect(
      canReviewReport({ userId: "m", isOfficer: false, advisorId: "a" }, "x"),
    ).toBe("forbidden");
  });
});

describe("easternDay", () => {
  it("reads the Eastern calendar day", () => {
    expect(easternDay(new Date("2026-10-25T02:00:00Z"))).toBe("2026-10-24");
  });
});
