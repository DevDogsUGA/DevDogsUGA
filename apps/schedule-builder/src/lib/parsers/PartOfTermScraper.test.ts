import * as cheerio from "cheerio";
import { describe, it, expect, beforeEach } from "vitest";
import {
  CalendarIndexUnavailableError,
  CalendarNotFoundError,
  resolveCalendarId,
  resolveKnownCalendarId,
} from "./PartOfTermScraper";

const fixtureHtml = `
<select class="cal-year-select cal-year-select--alt" data-nav="ajax" data-ajax-url="https://reg.uga.edu/wp-admin/admin-ajax.php" aria-labelledby="cal-year-label-1">
  <option value="1513" selected>2026 – 2027</option>
  <option value="1512">2025 – 2026</option>
  <option value="https://reg.uga.edu/archives/calendars/#parts-of-term" data-nav="url">Archives</option>
</select>
`;

describe("resolveCalendarId", () => {
  let $page: ReturnType<typeof cheerio.load>;

  beforeEach(() => {
    $page = cheerio.load(fixtureHtml);
  });

  it("resolves 202608 (Fall 2026) to 1513", () => {
    const result = resolveCalendarId($page, 202608);
    expect(result).toBe("1513");
  });

  it("resolves 202702 (Spring 2027) to 1513", () => {
    const result = resolveCalendarId($page, 202702);
    expect(result).toBe("1513");
  });

  it("resolves 202705 (Summer 2027) to 1513", () => {
    const result = resolveCalendarId($page, 202705);
    expect(result).toBe("1513");
  });

  it("resolves 202508 (Fall 2025) to 1512", () => {
    const result = resolveCalendarId($page, 202508);
    expect(result).toBe("1512");
  });

  it("throws error for out-of-range period (203008)", () => {
    expect(() => resolveCalendarId($page, 203008)).toThrowError(
      CalendarNotFoundError,
    );
  });

  it("distinguishes an unavailable selector from a missing year", () => {
    expect(() => resolveCalendarId(cheerio.load("<html></html>"), 202608))
      .toThrowError(CalendarIndexUnavailableError);
  });

  it("does not include Archives URL in error message", () => {
    try {
      resolveCalendarId($page, 203008);
      throw new Error("Should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain(
        "https://reg.uga.edu/archives/calendars/#parts-of-term",
      );
    }
  });
});

describe("resolveKnownCalendarId", () => {
  it.each([
    [202508, "1512"],
    [202602, "1512"],
    [202605, "1512"],
    [202608, "1513"],
    [202702, "1513"],
    [202705, "1513"],
  ])("resolves academic period %i to verified calendar %s", (period, id) => {
    expect(resolveKnownCalendarId(period)).toBe(id);
  });

  it("does not guess an unverified calendar ID", () => {
    expect(resolveKnownCalendarId(202708)).toBeUndefined();
  });
});
