import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SemesterView } from "~/lib/weeklyArt";
import WeeklyArt from ".";

const art = {
  lines: ["oo oo", "(_)(_)"],
  regions: {
    "2026-09-07": [
      [0, 0, 2],
      [1, 0, 3],
    ],
    "2026-09-14": [
      [0, 3, 2],
      [1, 3, 3],
    ],
  },
} as SemesterView["art"];

const view = (overrides: Partial<SemesterView> = {}): SemesterView => ({
  id: "fall-2026",
  label: "Fall 2026",
  weeks: [
    { week: "2026-09-07", state: "lit" },
    { week: "2026-09-14", state: "no-meeting" },
  ],
  lit: 1,
  total: 1,
  text: "Fall 2026: 1 of 1 week",
  art,
  ...overrides,
});

const render = (
  semesters: SemesterView[],
  treatment: "frost" | "omit" = "frost",
) =>
  renderToStaticMarkup(
    <WeeklyArt
      heading="Weekly streak"
      headingId="h"
      current={3}
      longest={5}
      semesters={semesters}
      treatment={treatment}
    />,
  );

describe("WeeklyArt", () => {
  it("says the picture in words and hides the picture from assistive tech", () => {
    const html = render([view()]);
    expect(html).toContain("Fall 2026: 1 of 1 week");
    expect(html).toMatch(/<div class="wa-art" aria-hidden="true">/);
    // The text equivalent is outside the aria-hidden region.
    expect(html.indexOf("Fall 2026: 1 of 1 week")).toBeLessThan(
      html.indexOf("aria-hidden"),
    );
  });

  it("shows current and longest streak in weeks", () => {
    const html = render([view()]);
    expect(html).toContain("Current streak");
    expect(html).toContain("3 <small>weeks</small>");
    expect(html).toContain("5 <small>weeks</small>");
  });

  it("draws an empty week as frost, or leaves it out on the other setting", () => {
    expect(render([view()], "frost")).toContain('class="wa-frost"');
    expect(render([view()], "omit")).not.toContain("wa-frost");
  });

  it("falls back to a plain row of week cells without art", () => {
    const html = render([view({ art: null })]);
    expect(html).toContain('class="wa-cells"');
    expect(html).not.toContain("wa-pre");
    expect(html.match(/<li/g)?.length).toBe(2);
    // "omit" drops the frozen week's cell.
    expect(render([view({ art: null })], "omit").match(/<li/g)?.length).toBe(1);
  });

  it("folds earlier semesters under a disclosure", () => {
    const html = render([
      view(),
      view({
        id: "spring-2026",
        label: "Spring 2026",
        text: "Spring 2026: 4 of 9 weeks",
      }),
    ]);
    expect(html).toContain("Earlier semesters");
    expect(html.indexOf("Fall 2026: 1")).toBeLessThan(html.indexOf("<details"));
    expect(html.indexOf("<details")).toBeLessThan(
      html.indexOf("Spring 2026: 4 of 9 weeks"),
    );
  });

  it("says so when no semester has started", () => {
    expect(render([])).toContain("No semester has started yet.");
  });
});
