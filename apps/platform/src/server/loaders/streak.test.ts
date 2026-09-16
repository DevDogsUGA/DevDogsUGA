import { describe, expect, it } from "vitest";
import { calculateStreak, clubWeekKey } from "./streakPolicy";

const at = (day: string) => new Date(`${day}T22:00:00.000Z`);

describe("participation streaks", () => {
  it("uses Monday club weeks", () => {
    expect(clubWeekKey(at("2026-09-07"))).toBe("2026-09-07");
    expect(clubWeekKey(at("2026-09-13"))).toBe("2026-09-07");
  });

  it("requires every opportunity in a one-event week and two otherwise", () => {
    const opportunities = [
      at("2026-08-31"),
      at("2026-09-07"),
      at("2026-09-08"),
    ];
    const earned = [...opportunities];
    expect(
      calculateStreak(opportunities, earned, at("2026-09-13")),
    ).toMatchObject({
      current: 2,
      longest: 2,
      thisWeekRequired: 2,
    });
  });

  it("does not break a streak during an unfinished current week", () => {
    const opportunities = [
      at("2026-08-31"),
      at("2026-09-07"),
      at("2026-09-10"),
    ];
    expect(
      calculateStreak(opportunities, [at("2026-08-31")], at("2026-09-08")),
    ).toMatchObject({ current: 1, thisWeekEarned: 0, thisWeekRequired: 2 });
  });

  it("uses a competition's supplied start week even if earned later", () => {
    const competitionStart = at("2026-08-31");
    expect(
      calculateStreak([competitionStart], [competitionStart], at("2026-09-07")),
    ).toMatchObject({ current: 1, longest: 1 });
  });
});
