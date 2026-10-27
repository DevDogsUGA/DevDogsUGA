import { describe, expect, it } from "vitest";
import { getBadges, getWorkshops } from "@devdogsuga/events";
import {
  DELETED_AWARDER_NAME,
  groupAwards,
  multiplierLabel,
  type AwardRow,
} from "./display";

const config = getBadges();
const workshops = getWorkshops().workshops;

function row(overrides: Partial<AwardRow> & { id: string }): AwardRow {
  return {
    badgeId: "mentor",
    workshopDefinitionId: null,
    method: "manual",
    awardedAt: new Date("2026-10-01T12:00:00Z"),
    awardedBy: "officer",
    awardedByName: "An Officer",
    citation: "Helped with the first PR",
    withdrawnAt: null,
    withdrawnReason: null,
    hidden: false,
    ...overrides,
  };
}

describe("groupAwards", () => {
  it("folds repeated awards into one entry with a count, newest first", () => {
    const entries = groupAwards(
      [
        row({ id: "a", awardedAt: new Date("2026-09-01T00:00:00Z") }),
        row({ id: "b", awardedAt: new Date("2026-10-05T00:00:00Z") }),
      ],
      config,
      workshops,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);
    expect(entries[0]?.awards.map((a) => a.id)).toEqual(["b", "a"]);
    expect(multiplierLabel(entries[0]!)).toBe("×2");
  });

  it("keeps workshop completions separate per workshop", () => {
    const [first, second] = workshops;
    const entries = groupAwards(
      [
        row({
          id: "a",
          badgeId: "workshop-completed",
          workshopDefinitionId: first!.id,
          method: "automatic",
          awardedBy: null,
          awardedByName: null,
          citation: null,
        }),
        row({
          id: "b",
          badgeId: "workshop-completed",
          workshopDefinitionId: second!.id,
          method: "automatic",
          awardedBy: null,
          awardedByName: null,
          citation: null,
        }),
      ],
      config,
      workshops,
    );
    expect(entries.map((e) => e.name).sort()).toEqual(
      [
        `Workshop completed: ${first!.title}`,
        `Workshop completed: ${second!.title}`,
      ].sort(),
    );
    expect(entries.every((e) => multiplierLabel(e) === null)).toBe(true);
    expect(entries[0]?.awards[0]?.awardedByLabel).toBeNull();
  });

  it("drops withdrawn awards unless asked", () => {
    const rows = [
      row({ id: "a", withdrawnAt: new Date(), withdrawnReason: "x" }),
    ];
    expect(groupAwards(rows, config, workshops)).toEqual([]);
    const kept = groupAwards(rows, config, workshops, {
      includeWithdrawn: true,
    });
    expect(kept[0]?.count).toBe(0);
    expect(kept[0]?.awards).toHaveLength(1);
  });

  it("omits a hidden badge from the public view and hides its citation", () => {
    const rows = [row({ id: "a", hidden: true })];
    expect(groupAwards(rows, config, workshops)).toEqual([]);
    const own = groupAwards(rows, config, workshops, { includeHidden: true });
    expect(own[0]?.hidden).toBe(true);
    expect(own[0]?.awards[0]?.citation).toBe("Helped with the first PR");
  });

  it("shows a deleted officer as Deleted member", () => {
    const [entry] = groupAwards(
      [row({ id: "a", awardedBy: null, awardedByName: null })],
      config,
      workshops,
    );
    expect(entry?.awards[0]?.awardedByLabel).toBe(DELETED_AWARDER_NAME);
  });

  it("names the awarding officer while they exist", () => {
    const [entry] = groupAwards([row({ id: "a" })], config, workshops);
    expect(entry?.awards[0]?.awardedByLabel).toBe("An Officer");
  });
});
