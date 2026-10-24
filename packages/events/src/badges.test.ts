import { describe, expect, it } from "vitest";
import {
  allBadges,
  badgesConfigSchema,
  resolveBadge,
  validateBadges,
} from "./badges.js";
import { getBadges, getWorkshops, parseBadges } from "./index.js";

describe("badges.json", () => {
  const config = getBadges();
  const workshops = getWorkshops().workshops;

  it("defines the six initial badges", () => {
    expect(config.badges.map((b) => b.id)).toEqual([
      "workshop-completed",
      "first-merge",
      "workshop-host",
      "guide-author",
      "mentor",
      "event-organizer",
    ]);
  });

  it("keeps the automatic badges one-time and the officer ones repeatable", () => {
    for (const badge of config.badges) {
      expect(badge.repeatable).toBe(badge.kind === "manual");
    }
  });

  it("expands Workshop completed into one badge per workshop", () => {
    const completed = allBadges(config, workshops).filter(
      (b) => b.badgeId === "workshop-completed",
    );
    expect(completed.map((b) => b.workshopDefinitionId)).toEqual(
      workshops.map((w) => w.id),
    );
    expect(completed[0]?.name).toBe(
      `Workshop completed: ${workshops[0]?.title}`,
    );
  });

  it("still names an award whose badge or workshop was since removed", () => {
    expect(resolveBadge(config, workshops, "gone", null).name).toBe("gone");
    expect(
      resolveBadge(config, workshops, "workshop-completed", "gone").name,
    ).toBe("Workshop completed: gone");
  });
});

describe("validateBadges", () => {
  const base = {
    badges: [
      {
        id: "workshop-completed",
        name: "Workshop completed",
        description: "d",
        kind: "automatic",
        repeatable: false,
        perWorkshop: true,
      },
      {
        id: "first-merge",
        name: "First Merge",
        description: "d",
        kind: "automatic",
        repeatable: false,
        perWorkshop: false,
      },
    ],
  };

  it("accepts the minimum", () => {
    expect(validateBadges(badgesConfigSchema.parse(base))).toEqual([]);
  });

  it("refuses a duplicate id", () => {
    const dup = badgesConfigSchema.parse({
      badges: [...base.badges, base.badges[1]],
    });
    expect(validateBadges(dup).map((i) => i.message)).toContain(
      "Badge id is used twice.",
    );
  });

  it("refuses a missing platform-awarded badge", () => {
    expect(() => parseBadges({ badges: [base.badges[0]] })).toThrow(
      /first-merge/,
    );
  });

  it("refuses a repeatable per-workshop badge", () => {
    const bad = badgesConfigSchema.parse({
      badges: [{ ...base.badges[0], repeatable: true }, base.badges[1]],
    });
    expect(validateBadges(bad).length).toBeGreaterThan(0);
  });
});
