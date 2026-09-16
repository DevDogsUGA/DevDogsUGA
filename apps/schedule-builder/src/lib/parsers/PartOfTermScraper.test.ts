import * as cheerio from "cheerio";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveCalendarId } from "./PartOfTermScraper";

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
    expect(() => resolveCalendarId($page, 203008)).toThrow(
      "No calendar found for",
    );
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
