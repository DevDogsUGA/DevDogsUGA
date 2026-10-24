/**
 * `import badges`: the planning rules, the dry run and the confirmation,
 * against fake evidence and a fake store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planBadges, runBadges } from "./commands.js";
import {
  pairKey,
  planFirstMerge,
  planWorkshops,
  type ReflectionEvidence,
} from "./plan.js";
import type { Evidence } from "./store.js";

function evidence(
  id: string,
  overrides: Partial<ReflectionEvidence> = {},
): ReflectionEvidence {
  return {
    reflectionId: id,
    userId: "u1",
    meetingId: "m1",
    workshopDefinitionId: "ws-a",
    offered: ["ws-a"],
    attended: true,
    meetingLive: true,
    ...overrides,
  };
}

describe("planWorkshops", () => {
  it("awards a chosen workshop the meeting ran, once per member and workshop", () => {
    const plan = planWorkshops(
      [evidence("r1"), evidence("r2", { meetingId: "m2" })],
      new Set(),
    );
    expect(plan.awards).toEqual([
      { userId: "u1", definitionId: "ws-a", assign: [] },
    ]);
  });

  it("uses the meeting's only workshop when none was chosen, and records it", () => {
    const plan = planWorkshops(
      [evidence("r1", { workshopDefinitionId: null })],
      new Set(),
    );
    expect(plan.awards).toEqual([
      { userId: "u1", definitionId: "ws-a", assign: ["r1"] },
    ]);
  });

  it("skips, and counts, what it would have to guess", () => {
    const plan = planWorkshops(
      [
        evidence("r1", { workshopDefinitionId: null, offered: ["a", "b"] }),
        evidence("r2", { workshopDefinitionId: null, offered: [] }),
        evidence("r3", { attended: false }),
        evidence("r4", { meetingLive: false }),
        evidence("r5", { workshopDefinitionId: "other" }),
      ],
      new Set(),
    );
    expect(plan.awards).toEqual([]);
    expect(plan.skipped).toEqual({
      "no attendance": 1,
      "meeting archived or cancelled": 1,
      "workshop did not run at the meeting": 1,
      "meeting ran no workshop": 1,
      "meeting ran several workshops and none was chosen": 1,
    });
  });

  it("leaves a pair that already has a live award of any kind alone", () => {
    const plan = planWorkshops(
      [evidence("r1"), evidence("r2", { workshopDefinitionId: null })],
      new Set([pairKey("u1", "ws-a")]),
    );
    expect(plan.awards).toEqual([]);
    expect(plan.alreadyAwarded).toBe(1);
  });
});

describe("planFirstMerge", () => {
  it("skips members who ever held the badge", () => {
    expect(planFirstMerge(["a", "b", "b", "c"], new Set(["c"]))).toEqual({
      userIds: ["a", "b"],
      alreadyHeld: 1,
    });
  });
});

describe("runBadges", () => {
  let stderr: string;
  beforeEach(() => {
    stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    process.exitCode = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  const data: Evidence = {
    reflections: [
      evidence("r1"),
      evidence("r2", {
        userId: "u2",
        workshopDefinitionId: null,
        offered: ["a", "b"],
      }),
    ],
    liveWorkshopAwards: new Set(),
    contributors: ["u1"],
    firstMergeHolders: new Set(),
  };
  const base = () => ({ evidence: async () => data, interactive: false });
  const applied = { workshopAwarded: 1, firstMergeAwarded: 1 };

  it("prints per badge and writes nothing on a dry run", async () => {
    const apply = vi.fn();
    await runBadges(["--dry-run"], { ...base(), apply });
    expect(apply).not.toHaveBeenCalled();
    expect(stderr).toContain("Workshop completed:");
    expect(stderr).toContain("1 skipped: meeting ran several workshops");
    expect(stderr).toContain("First Merge:");
  });

  it("refuses to write without --yes and no terminal", async () => {
    const apply = vi.fn();
    await runBadges([], { ...base(), apply });
    expect(apply).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("applies the plan with --yes", async () => {
    const apply = vi.fn(async () => applied);
    await runBadges(["--yes"], { ...base(), apply });
    expect(apply).toHaveBeenCalledWith(planBadges(data));
    expect(process.exitCode).toBeUndefined();
  });

  it("does nothing when everything is held", async () => {
    const apply = vi.fn();
    await runBadges(["--yes"], {
      evidence: async () => ({
        ...data,
        liveWorkshopAwards: new Set([pairKey("u1", "ws-a")]),
        firstMergeHolders: new Set(["u1"]),
      }),
      apply,
      interactive: false,
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
