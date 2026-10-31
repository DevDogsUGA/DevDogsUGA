// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  EARLIER_LIMIT,
  isCurrent,
  orderHackathons,
  statusOf,
  whenText,
  type ListedHackathon,
} from "./present";

const TODAY = "2026-11-01";
const h = (over: Partial<ListedHackathon> = {}): ListedHackathon => ({
  id: over.name ?? "x",
  name: "Hack",
  url: "https://h.example.com/",
  location: "Online",
  openState: null,
  dateLabel: null,
  startsOn: null,
  endsOn: null,
  ...over,
});

describe("isCurrent", () => {
  it("is false once marked closed or past its end", () => {
    expect(isCurrent(h({ openState: "closed" }), TODAY)).toBe(false);
    expect(isCurrent(h({ endsOn: "2026-10-31" }), TODAY)).toBe(false);
  });
  it("is true on the end day, with no dates, or open", () => {
    expect(isCurrent(h({ endsOn: TODAY }), TODAY)).toBe(true);
    expect(isCurrent(h(), TODAY)).toBe(true);
    expect(isCurrent(h({ openState: "open" }), TODAY)).toBe(true);
  });
});

describe("statusOf", () => {
  it("prefers Devpost's own word while current", () => {
    expect(
      statusOf(h({ openState: "open", startsOn: "2026-12-01" }), TODAY),
    ).toBe("open");
    expect(statusOf(h({ openState: "upcoming" }), TODAY)).toBe("upcoming");
  });
  it("reads a member's submission from its dates", () => {
    expect(statusOf(h({ startsOn: "2026-12-01" }), TODAY)).toBe("upcoming");
    expect(
      statusOf(h({ startsOn: "2026-10-01", endsOn: "2026-12-01" }), TODAY),
    ).toBe("open");
  });
  it("has no badge for an undated submission, and says earlier once over", () => {
    expect(statusOf(h(), TODAY)).toBeNull();
    expect(
      statusOf(h({ endsOn: "2026-01-01", openState: "open" }), TODAY),
    ).toBe("earlier");
  });
});

describe("whenText", () => {
  it("shows Devpost's label as given", () => {
    expect(
      whenText(
        h({ dateLabel: "Oct 01 - Nov 12, 2026", startsOn: "2026-10-01" }),
      ),
    ).toBe("Oct 01 - Nov 12, 2026");
  });
  it("formats entered dates", () => {
    expect(whenText(h({ startsOn: "2026-11-02", endsOn: "2026-11-04" }))).toBe(
      "Nov 2, 2026 – Nov 4, 2026",
    );
    expect(whenText(h({ startsOn: "2026-11-02", endsOn: "2026-11-02" }))).toBe(
      "Nov 2, 2026",
    );
    expect(whenText(h({ startsOn: "2026-11-02" }))).toBe("Starts Nov 2, 2026");
    expect(whenText(h({ endsOn: "2026-11-02" }))).toBe("Ends Nov 2, 2026");
    expect(whenText(h())).toBeNull();
  });
});

describe("orderHackathons", () => {
  it("lists current soonest first, undated last by name, then earlier newest first", () => {
    const { current, earlier } = orderHackathons(
      [
        h({ name: "Zed" }),
        h({ name: "Late", startsOn: "2026-12-01", endsOn: "2026-12-05" }),
        h({ name: "Soon", startsOn: "2026-11-02", endsOn: "2026-11-05" }),
        h({ name: "Alpha" }),
        h({ name: "Old", endsOn: "2026-09-01" }),
        h({ name: "Newer", endsOn: "2026-10-20" }),
        h({ name: "Closed", openState: "closed" }),
      ],
      TODAY,
    );
    expect(current.map((x) => x.name)).toEqual([
      "Soon",
      "Late",
      "Alpha",
      "Zed",
    ]);
    expect(earlier.map((x) => x.name)).toEqual(["Newer", "Old", "Closed"]);
    expect(current[0]!.status).toBe("upcoming");
    expect(earlier[0]!.status).toBe("earlier");
  });

  it("caps the earlier list", () => {
    const rows = Array.from({ length: EARLIER_LIMIT + 5 }, (_, i) =>
      h({ name: `E${String(i).padStart(3, "0")}`, endsOn: "2026-01-01" }),
    );
    expect(orderHackathons(rows, TODAY).earlier).toHaveLength(EARLIER_LIMIT);
  });
});
