import { describe, expect, it } from "vitest";
import {
  canUnlockByClosingPr,
  isLocked,
  lockReason,
  type LockInputs,
} from "./lockState";

/**
 * The lock predicate is read by the join checks, the team page, the officer
 * console and the "close your PR to add someone" hint. It is unit-tested
 * rather than only exercised through the actions because drift between those
 * readers is the failure it exists to prevent, and drift does not need a
 * database to happen.
 *
 * The cases below follow the lifecycle in the design note.
 */

const JUDGING = "2026-03-02T18:00:00Z";
const BEFORE = new Date("2026-03-01T12:00:00Z");
const AFTER = new Date("2026-03-02T19:30:00Z");

function team(overrides: Partial<LockInputs> = {}): LockInputs {
  return {
    submissionState: null,
    lockedManuallyAt: null,
    judgingStartsAt: JUDGING,
    ...overrides,
  };
}

describe("lockReason", () => {
  it("is open before any entry exists", () => {
    expect(lockReason(team(), BEFORE)).toBeNull();
    expect(isLocked(team(), BEFORE)).toBe(false);
  });

  it("locks on a live entry", () => {
    expect(lockReason(team({ submissionState: "open" }), BEFORE)).toBe("entry");
  });

  it("reopens when the PR is closed before judging", () => {
    expect(lockReason(team({ submissionState: "closed" }), BEFORE)).toBeNull();
  });

  it("treats a merged entry as still an entry", () => {
    expect(lockReason(team({ submissionState: "merged" }), BEFORE)).toBe(
      "entry",
    );
  });

  it("locks on the officer override with no entry at all", () => {
    expect(
      lockReason(team({ lockedManuallyAt: "2026-03-01T09:00:00Z" }), BEFORE),
    ).toBe("officer");
  });

  it("locks once judging begins, whatever the entry says", () => {
    for (const state of [null, "open", "closed", "merged"] as const) {
      expect(
        lockReason(team({ submissionState: state }), AFTER),
        `submissionState=${state}`,
      ).toBe("judging");
    }
  });

  it("stays open when judging is not yet scheduled", () => {
    expect(lockReason(team({ judgingStartsAt: null }), AFTER)).toBeNull();
  });

  it("prefers judging over the reasons a team could act on", () => {
    // Ordering matters for the UI copy: after judging there is nothing the
    // team can do, and offering "close your PR" would be a lie.
    const t = team({
      submissionState: "open",
      lockedManuallyAt: "2026-03-01T09:00:00Z",
    });
    expect(lockReason(t, AFTER)).toBe("judging");
  });

  it("accepts Date and string timestamps alike", () => {
    expect(
      lockReason(team({ judgingStartsAt: new Date(JUDGING) }), AFTER),
    ).toBe("judging");
  });
});

describe("canUnlockByClosingPr", () => {
  it("is the affordance for a team that needs one more person", () => {
    expect(
      canUnlockByClosingPr(team({ submissionState: "open" }), BEFORE),
    ).toBe(true);
  });

  it("is bounded by judging, so no ringer joins at the table", () => {
    expect(canUnlockByClosingPr(team({ submissionState: "open" }), AFTER)).toBe(
      false,
    );
  });

  it("does not offer to unlock what closing cannot unlock", () => {
    expect(
      canUnlockByClosingPr(team({ submissionState: "merged" }), BEFORE),
    ).toBe(false);
    expect(
      canUnlockByClosingPr(
        team({ lockedManuallyAt: "2026-03-01T09:00:00Z" }),
        BEFORE,
      ),
    ).toBe(false);
  });
});
