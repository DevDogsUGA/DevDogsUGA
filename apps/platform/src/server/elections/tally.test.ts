import { describe, expect, it } from "vitest";
import {
  borda,
  copeland,
  electionPoints,
  requirementPoints,
  standings,
  type Ballot,
  type StandingsInput,
} from "./tally";

/**
 * Degenerate cases first. The interesting failures are all at the edges: every
 * team self-ranking, exact point ties, Condorcet cycles, a two-team
 * competition. Those are trivial to write against a pure function and nearly
 * impossible to provoke through the UI.
 */

const ballot = (...ranking: string[]): Ballot => ({ ranking });

describe("borda", () => {
  it("scores a first preference at n-1 and a last at 0", () => {
    const result = borda([ballot("a", "b", "c")], ["a", "b", "c"]);
    expect(result.find((r) => r.teamId === "a")?.score).toBe(2);
    expect(result.find((r) => r.teamId === "b")?.score).toBe(1);
    expect(result.find((r) => r.teamId === "c")?.score).toBe(0);
  });

  it("scales a unanimous sweep to exactly 1", () => {
    const result = borda(
      [ballot("a", "b", "c"), ballot("a", "b", "c"), ballot("a", "c", "b")],
      ["a", "b", "c"],
    );
    expect(result.find((r) => r.teamId === "a")?.scaled).toBe(1);
  });

  it("gives a two-team competition a defined ceiling", () => {
    const result = borda([ballot("a", "b"), ballot("a", "b")], ["a", "b"]);
    expect(result.find((r) => r.teamId === "a")?.scaled).toBe(1);
    expect(result.find((r) => r.teamId === "b")?.scaled).toBe(0);
  });

  it("does not divide by zero for one team or zero ballots", () => {
    expect(borda([ballot("a")], ["a"])[0]?.scaled).toBe(0);
    expect(borda([], ["a", "b"]).every((r) => r.scaled === 0)).toBe(true);
  });

  it("lets tied teams share a placement", () => {
    // Ties need no resolution at the election level: tied teams take identical
    // scaled values and earn identical points.
    const result = borda(
      [ballot("a", "b", "c"), ballot("b", "a", "c")],
      ["a", "b", "c"],
    );
    const a = result.find((r) => r.teamId === "a")!;
    const b = result.find((r) => r.teamId === "b")!;
    expect(a.score).toBe(b.score);
    expect(a.placement).toBe(b.placement);
    expect(result.find((r) => r.teamId === "c")?.placement).toBe(3);
  });

  it("preserves margins rather than spreading them across the block", () => {
    // The property min-max scaling would have destroyed: two fixtures one
    // Borda point apart must not land at opposite ends of the range.
    const close = borda(
      [ballot("a", "b", "c"), ballot("b", "a", "c"), ballot("a", "b", "c")],
      ["a", "b", "c"],
    );
    const a = close.find((r) => r.teamId === "a")!.scaled;
    const b = close.find((r) => r.teamId === "b")!.scaled;
    expect(Math.abs(a - b)).toBeLessThan(0.25);
  });
});

describe("copeland", () => {
  it("scores wins minus losses", () => {
    const result = copeland(
      [ballot("a", "b", "c"), ballot("a", "b", "c"), ballot("a", "c", "b")],
      ["a", "b", "c"],
    );
    expect(result.scores.get("a")).toBe(2);
    expect(result.scores.get("c")).toBe(-2);
  });

  it("ties every team on a Condorcet cycle", () => {
    // A beats B, B beats C, C beats A. Every pair decisive, every score 0,
    // which is why step 3 has to exist.
    const result = copeland(
      [ballot("a", "b", "c"), ballot("b", "c", "a"), ballot("c", "a", "b")],
      ["a", "b", "c"],
    );
    expect([...result.scores.values()]).toEqual([0, 0, 0]);
  });

  it("records the pairwise matrix for replay", () => {
    const result = copeland([ballot("a", "b")], ["a", "b"]);
    expect(result.pairs).toEqual([
      { teamA: "a", teamB: "b", aOverB: 1, bOverA: 0 },
    ]);
  });
});

describe("requirementPoints", () => {
  it("pins the worked example: 11 of 12 is exactly 550", () => {
    expect(requirementPoints(11, 12, 600)).toBe(550);
  });

  it("is linear, with no cliff and no bonus", () => {
    expect(requirementPoints(6, 12, 600)).toBe(300);
    expect(requirementPoints(12, 12, 600)).toBe(600);
    expect(requirementPoints(0, 12, 600)).toBe(0);
  });

  it("returns zero when the competition had no requirements", () => {
    expect(requirementPoints(0, 0, 600)).toBe(0);
  });
});

describe("electionPoints", () => {
  it("rounds once on the block, not per election", () => {
    // Rounding each of three elections separately caps a perfect team at 399.
    for (const k of [1, 2, 3]) {
      expect(electionPoints(Array<number>(k).fill(1), k, 400)).toBe(400);
    }
  });

  it("is zero when there are no elections", () => {
    expect(electionPoints([], 0, 400)).toBe(0);
  });
});

function input(overrides: Partial<StandingsInput> = {}): StandingsInput {
  return {
    teams: ["a", "b"],
    requirementCount: 10,
    grades: [
      { teamId: "a", requirementsMet: 10 },
      { teamId: "b", requirementsMet: 5 },
    ],
    elections: [],
    pooledBallots: [],
    tiebreak: null,
    ...overrides,
  };
}

describe("standings", () => {
  it("blocks on an ungraded competition rather than defaulting to zero", () => {
    expect(standings(input({ requirementCount: null }))).toEqual({
      status: "blocked",
      reason: "ungraded",
    });
  });

  it("blocks when any single team is ungraded", () => {
    const outcome = standings(
      input({
        grades: [
          { teamId: "a", requirementsMet: 10 },
          { teamId: "b", requirementsMet: null },
        ],
      }),
    );
    expect(outcome).toEqual({ status: "blocked", reason: "ungraded" });
  });

  it("renormalizes requirements to 1000 when there are no elections", () => {
    const outcome = standings(input());
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.standings.find((s) => s.teamId === "a")?.totalPoints).toBe(
      1000,
    );
  });

  it("renormalizes elections to 1000 when requirementCount is zero", () => {
    const outcome = standings(
      input({
        requirementCount: 0,
        grades: [
          { teamId: "a", requirementsMet: 0 },
          { teamId: "b", requirementsMet: 0 },
        ],
        elections: [
          { electionId: "e1", results: [{ teamId: "a", scaled: 1 }] },
        ],
      }),
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.standings.find((s) => s.teamId === "a")?.totalPoints).toBe(
      1000,
    );
  });

  it("scores everyone zero when both blocks are absent", () => {
    // The two rules interact, and the interaction is correct rather than
    // incidental: every team scoring 0 is an exact tie across the whole field,
    // so placements still have to come from the chain. Finalizing therefore
    // requires a tiebreak. See the case below.
    const outcome = standings(
      input({
        requirementCount: 0,
        grades: [
          { teamId: "a", requirementsMet: 0 },
          { teamId: "b", requirementsMet: 0 },
        ],
        tiebreak: ballot("a", "b"),
      }),
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.standings.every((s) => s.totalPoints === 0)).toBe(true);
    expect(outcome.standings.map((s) => s.teamId)).toEqual(["a", "b"]);
  });

  it("blocks a zero-scoring competition that has no tiebreak", () => {
    const outcome = standings(
      input({
        requirementCount: 0,
        grades: [
          { teamId: "a", requirementsMet: 0 },
          { teamId: "b", requirementsMet: 0 },
        ],
      }),
    );
    expect(outcome).toEqual({ status: "blocked", reason: "missing_tiebreak" });
  });

  it("totals exactly 1000 for a perfect competition at k = 1, 2 and 3", () => {
    for (const k of [1, 2, 3]) {
      const outcome = standings(
        input({
          requirementCount: 12,
          grades: [
            { teamId: "a", requirementsMet: 12 },
            { teamId: "b", requirementsMet: 0 },
          ],
          elections: Array.from({ length: k }, (_, i) => ({
            electionId: `e${i}`,
            results: [
              { teamId: "a", scaled: 1 },
              { teamId: "b", scaled: 0 },
            ],
          })),
        }),
      );
      expect(outcome.status).toBe("ok");
      if (outcome.status !== "ok") return;
      expect(
        outcome.standings.find((s) => s.teamId === "a")?.totalPoints,
        `k=${k}`,
      ).toBe(1000);
    }
  });

  it("blocks when a tie reaches step 3 and no tiebreak was cast", () => {
    const outcome = standings(
      input({
        grades: [
          { teamId: "a", requirementsMet: 5 },
          { teamId: "b", requirementsMet: 5 },
        ],
      }),
    );
    expect(outcome).toEqual({ status: "blocked", reason: "missing_tiebreak" });
  });

  it("resolves an exact tie by Copeland before reaching the officers", () => {
    const outcome = standings(
      input({
        grades: [
          { teamId: "a", requirementsMet: 5 },
          { teamId: "b", requirementsMet: 5 },
        ],
        pooledBallots: [ballot("a", "b"), ballot("a", "b")],
      }),
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.standings[0]?.teamId).toBe("a");
    expect(outcome.standings[0]?.resolvedBy).toBe("copeland");
    // Nothing was decided by the officers, so nothing is disclosed.
    expect(outcome.disclosures).toEqual([]);
  });

  it("falls through a Condorcet cycle to the officer tiebreak", () => {
    const outcome = standings(
      input({
        teams: ["a", "b", "c"],
        grades: [
          { teamId: "a", requirementsMet: 5 },
          { teamId: "b", requirementsMet: 5 },
          { teamId: "c", requirementsMet: 5 },
        ],
        pooledBallots: [
          ballot("a", "b", "c"),
          ballot("b", "c", "a"),
          ballot("c", "a", "b"),
        ],
        tiebreak: ballot("c", "a", "b"),
      }),
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.standings.map((s) => s.teamId)).toEqual(["c", "a", "b"]);
    expect(
      outcome.standings.every((s) => s.resolvedBy === "officer-tiebreak"),
    ).toBe(true);
  });

  it("discloses one comparison per decided pair, never the ordering", () => {
    // The officer ranking is cast for every competition and used in almost
    // none. When it decides a tie, the only thing revealed is the relation it
    // was used for, never the full order and nothing about teams whose
    // placement was never in question.
    const outcome = standings(
      input({
        teams: ["a", "b", "c"],
        requirementCount: 10,
        grades: [
          { teamId: "a", requirementsMet: 10 },
          { teamId: "b", requirementsMet: 5 },
          { teamId: "c", requirementsMet: 5 },
        ],
        tiebreak: ballot("a", "b", "c"),
      }),
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    // `a` was never tied, so it appears in no disclosure.
    expect(outcome.disclosures).toEqual([
      { higherTeamId: "b", lowerTeamId: "c" },
    ]);
  });

  it("is deterministic: the same fixture tallied twice is identical", () => {
    const fixture = input({
      teams: ["a", "b", "c"],
      grades: [
        { teamId: "a", requirementsMet: 5 },
        { teamId: "b", requirementsMet: 5 },
        { teamId: "c", requirementsMet: 5 },
      ],
      pooledBallots: [ballot("a", "b", "c"), ballot("b", "c", "a")],
      tiebreak: ballot("a", "b", "c"),
    });
    expect(standings(fixture)).toEqual(standings(fixture));
  });

  it("keeps self-ranking order-preserving", () => {
    // If every team ranks itself first the range compresses uniformly, which
    // shifts every score identically and changes no ordering.
    const noSelf = standings(
      input({
        teams: ["a", "b", "c"],
        requirementCount: 0,
        grades: [
          { teamId: "a", requirementsMet: 0 },
          { teamId: "b", requirementsMet: 0 },
          { teamId: "c", requirementsMet: 0 },
        ],
        elections: [
          {
            electionId: "e1",
            results: borda(
              [ballot("a", "b", "c"), ballot("a", "b", "c")],
              ["a", "b", "c"],
            ),
          },
        ],
        tiebreak: ballot("a", "b", "c"),
      }),
    );
    const withSelf = standings(
      input({
        teams: ["a", "b", "c"],
        requirementCount: 0,
        grades: [
          { teamId: "a", requirementsMet: 0 },
          { teamId: "b", requirementsMet: 0 },
          { teamId: "c", requirementsMet: 0 },
        ],
        elections: [
          {
            electionId: "e1",
            results: borda(
              [
                ballot("a", "b", "c"),
                ballot("b", "a", "c"),
                ballot("c", "a", "b"),
              ],
              ["a", "b", "c"],
            ),
          },
        ],
        tiebreak: ballot("a", "b", "c"),
      }),
    );

    expect(noSelf.status).toBe("ok");
    expect(withSelf.status).toBe("ok");
    if (noSelf.status !== "ok" || withSelf.status !== "ok") return;
    expect(noSelf.standings.map((s) => s.teamId)).toEqual(["a", "b", "c"]);
    expect(withSelf.standings[0]?.teamId).toBe("a");
  });
});
