import { describe, expect, it } from "vitest";
import {
  academicsLine,
  DIRECTORY_PAGE_SIZE,
  directoryHref,
  escapeLike,
  isFiltered,
  pageBounds,
  parseDirectoryQuery,
} from "./directoryQuery";

describe("parseDirectoryQuery", () => {
  it("defaults to no search, no filters, page 1", () => {
    expect(parseDirectoryQuery({})).toEqual({
      q: "",
      leadership: false,
      major: null,
      year: null,
      page: 1,
    });
  });

  it("reads URLSearchParams and page-style records alike", () => {
    const fromParams = parseDirectoryQuery(
      new URLSearchParams("q=ada&leadership=1&major=Math&year=2030&page=3"),
    );
    const fromRecord = parseDirectoryQuery({
      q: ["ada", "ignored"],
      leadership: "1",
      major: "Math",
      year: "2030",
      page: "3",
    });
    expect(fromParams).toEqual(fromRecord);
    expect(fromParams).toEqual({
      q: "ada",
      leadership: true,
      major: "Math",
      year: 2030,
      page: 3,
    });
  });

  it("trims, collapses and caps the search", () => {
    expect(parseDirectoryQuery({ q: "  ada   love  " }).q).toBe("ada love");
    expect(parseDirectoryQuery({ q: "x".repeat(500) }).q).toHaveLength(64);
  });

  it("degrades junk to no filter", () => {
    const q = parseDirectoryQuery({
      leadership: "yes",
      year: "20x0",
      page: "-4",
      major: "   ",
    });
    expect(q).toMatchObject({
      leadership: false,
      year: null,
      page: 1,
      major: null,
    });
    expect(parseDirectoryQuery({ year: "1800" }).year).toBeNull();
    expect(parseDirectoryQuery({ page: "0" }).page).toBe(1);
  });
});

describe("isFiltered / directoryHref", () => {
  it("ignores the page number when deciding", () => {
    expect(isFiltered(parseDirectoryQuery({ page: "4" }))).toBe(false);
    expect(isFiltered(parseDirectoryQuery({ year: "2030" }))).toBe(true);
  });

  it("prints a canonical URL and omits defaults", () => {
    expect(directoryHref(parseDirectoryQuery({}))).toBe("/community");
    const q = parseDirectoryQuery({ q: "a b", major: "C&S", leadership: "1" });
    expect(directoryHref(q, 1)).toBe(
      "/community?q=a+b&leadership=1&major=C%26S",
    );
    expect(directoryHref(q, 2)).toBe(
      "/community?q=a+b&leadership=1&major=C%26S&page=2",
    );
  });
});

describe("escapeLike", () => {
  it("escapes the three LIKE metacharacters", () => {
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("pageBounds", () => {
  it("clamps into range", () => {
    const size = DIRECTORY_PAGE_SIZE;
    expect(pageBounds(1, 0)).toEqual({ page: 1, totalPages: 1, offset: 0 });
    expect(pageBounds(99, size * 2 + 1)).toEqual({
      page: 3,
      totalPages: 3,
      offset: size * 2,
    });
    expect(pageBounds(2, size)).toMatchObject({ page: 1, totalPages: 1 });
  });
});

describe("academicsLine", () => {
  it("joins majors and class year, whichever exist", () => {
    expect(
      academicsLine({ majors: ["CS", "Math"], graduationYear: 2030 }),
    ).toBe("CS, Math · Class of 2030");
    expect(academicsLine({ majors: [], graduationYear: 2030 })).toBe(
      "Class of 2030",
    );
    expect(academicsLine({ majors: ["CS"], graduationYear: null })).toBe("CS");
    expect(academicsLine({ majors: [], graduationYear: null })).toBeNull();
  });
});
