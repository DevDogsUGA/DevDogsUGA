import { describe, expect, it } from "vitest";
import { presentedOrder, seedFrom, validateBallot } from "./ballotOrder";

const TEAMS = ["a", "b", "c", "d", "e"].map((teamId) => ({ teamId }));
const IDS = TEAMS.map((t) => t.teamId);

describe("presentedOrder", () => {
  it("is stable for one voter across renders", () => {
    // A fresh shuffle per render would move options under somebody mid-reorder,
    // and would make "I put us second" unverifiable against what they submitted.
    const seed = seedFrom("election-1", "user-1");
    const first = presentedOrder(TEAMS, null, seed);
    const second = presentedOrder(TEAMS, null, seed);
    expect(first).toEqual(second);
  });

  it("differs between voters", () => {
    const a = presentedOrder(TEAMS, null, seedFrom("election-1", "user-1"));
    const b = presentedOrder(TEAMS, null, seedFrom("election-1", "user-2"));
    expect(a).not.toEqual(b);
  });

  it("differs between elections for the same voter", () => {
    const a = presentedOrder(TEAMS, null, seedFrom("election-1", "user-1"));
    const b = presentedOrder(TEAMS, null, seedFrom("election-2", "user-1"));
    expect(a).not.toEqual(b);
  });

  it("pins the voter's own team first", () => {
    const order = presentedOrder(TEAMS, "d", seedFrom("election-1", "user-1"));
    expect(order[0]!.teamId).toBe("d");
  });

  it("keeps every option exactly once", () => {
    const order = presentedOrder(TEAMS, "c", seedFrom("e", "u"));
    expect(order.map((o) => o.teamId).sort()).toEqual([...IDS].sort());
  });

  it("shuffles an officer ballot completely", () => {
    // Null ownTeamId pins nothing. There is only one officer ballot, but it
    // carries the weight of an entire category, so it shuffles too.
    const order = presentedOrder(
      TEAMS,
      null,
      seedFrom("election-1", "officer"),
    );
    expect(order).toHaveLength(TEAMS.length);
  });

  it("does not consistently favour the alphabetically first team", () => {
    // The bias the shuffle exists to remove: a prefilled alphabetical list
    // rewards teams whose names sort early. Nothing is pinned here, so across
    // many voters "a" should lead about 1/5 of the time (5 teams), not always.
    let firstIsA = 0;
    for (let i = 0; i < 400; i += 1) {
      const order = presentedOrder(
        TEAMS,
        null,
        seedFrom("election-1", `u${i}`),
      );
      if (order[0]!.teamId === "a") firstIsA += 1;
    }
    expect(firstIsA).toBeGreaterThan(400 * 0.1);
    expect(firstIsA).toBeLessThan(400 * 0.35);
  });

  it("handles a single-team field without looping", () => {
    expect(presentedOrder([{ teamId: "solo" }], "solo", 1)).toEqual([
      { teamId: "solo" },
    ]);
  });
});

describe("validateBallot", () => {
  it("accepts a complete, touched ranking", () => {
    expect(validateBallot(["e", "d", "c", "b", "a"], IDS, true)).toBeNull();
  });

  it("rejects an untouched form", () => {
    // The form enforces this too, but the form is the half an attacker skips.
    expect(validateBallot(IDS, IDS, false)).toBe("untouched");
  });

  it("rejects an incomplete ranking", () => {
    // Complete rankings are required, so a missing team is a rejection rather
    // than something the tally has to interpret.
    expect(validateBallot(["a", "b", "c"], IDS, true)).toBe("incomplete");
  });

  it("rejects a duplicated team", () => {
    expect(validateBallot(["a", "a", "b", "c", "d"], IDS, true)).toBe(
      "duplicate",
    );
  });

  it("rejects a team that is not on the ballot", () => {
    expect(validateBallot(["a", "b", "c", "d", "z"], IDS, true)).toBe(
      "unknown_team",
    );
  });

  it("checks duplicates before length, so a padded ballot names the real fault", () => {
    // ["a","a","b","c","d"] is the right LENGTH. Reporting "incomplete" would
    // send the voter looking for a missing team that is not the problem.
    expect(validateBallot(["a", "a", "b", "c", "d"], IDS, true)).toBe(
      "duplicate",
    );
  });
});
