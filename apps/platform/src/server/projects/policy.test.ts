import { describe, expect, it } from "vitest";
import {
  commitTitle,
  easternDay,
  isQuarterHours,
  normalizeProjectName,
  parseRepos,
  parseTags,
  projectTextProblem,
  reportProblem,
} from "./policy";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const base = {
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  content: words(100),
  shas: ["a".repeat(40)],
};

describe("parseRepos", () => {
  it("takes owner/name, URLs and .git suffixes, one way or the other", () => {
    expect(
      parseRepos(
        "DevDogsUGA/DogDays, https://github.com/DevDogsUGA/DogPack.git\ndevdogsuga/dogdays",
      ),
    ).toEqual({
      ok: true,
      repos: ["DevDogsUGA/DogDays", "DevDogsUGA/DogPack"],
    });
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
    expect(
      reportProblem({ ...base, content: `  ${words(100)}\n` }, today),
    ).toBeNull();
  });
  it("wants at least one cited commit", () => {
    expect(reportProblem({ ...base, shas: [] }, today)).toBe("no_commits");
  });
  it("counts NBSP-separated words as the database does", () => {
    const nb = Array.from({ length: 100 }, () => "word").join("\u00a0");
    expect(reportProblem({ ...base, content: nb }, today)).toBeNull();
  });
  it("refuses backwards, future and year-long ranges", () => {
    expect(reportProblem({ ...base, startDate: "2026-10-15" }, today)).toBe(
      "bad_dates",
    );
    expect(reportProblem({ ...base, endDate: "2026-10-25" }, today)).toBe(
      "future",
    );
    expect(reportProblem({ ...base, startDate: "2025-10-01" }, today)).toBe(
      "range_too_long",
    );
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

describe("parseTags", () => {
  it("trims, lowercases and collapses duplicates", () => {
    expect(parseTags(" Web, web ,Mobile  App\n\nai ")).toEqual({
      ok: true,
      tags: ["web", "mobile app", "ai"],
    });
  });
  it("allows none", () => {
    expect(parseTags("")).toEqual({ ok: true, tags: [] });
  });
  it("bounds a tag and the list", () => {
    expect(parseTags("x".repeat(41)).ok).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`).join(",");
    expect(parseTags(many).ok).toBe(false);
    expect(
      parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(",")).ok,
    ).toBe(true);
  });
});

describe("project text", () => {
  it("collapses a name's whitespace", () => {
    expect(normalizeProjectName("  Dog   Days \n")).toBe("Dog Days");
  });
  it("bounds the name and the description", () => {
    expect(projectTextProblem("x", "")?.field).toBe("name");
    expect(projectTextProblem("x".repeat(81), "")?.field).toBe("name");
    expect(projectTextProblem("Porchlight", "d".repeat(1001))?.field).toBe(
      "description",
    );
    expect(projectTextProblem("Porchlight", "d".repeat(1000))).toBeNull();
  });
});

describe("commitTitle", () => {
  it("is the first line of the message", () => {
    expect(commitTitle("Add the feed\n\nLong body")).toBe("Add the feed");
    expect(commitTitle("  Fix  ")).toBe("Fix");
  });
});

describe("easternDay", () => {
  it("reads the Eastern calendar day", () => {
    expect(easternDay(new Date("2026-10-25T02:00:00Z"))).toBe("2026-10-24");
  });
});
