import { describe, expect, it } from "vitest";

/**
 * Imported from `~/lib/meetingSegments`, NOT from the loader that re-exports
 * them. The rules are pure and live there so nothing needs a database to
 * exercise them. The loader's first import is `~/server/db`, which resolves
 * `~/env` at module load, so reaching them through it would require stubbing
 * the database module out of the graph just to run arithmetic on dates.
 * Anything that genuinely touches `db` belongs in `queries.db-test.ts`.
 */
import {
  resolveMeetingSegments,
  type MeetingStructure,
} from "~/lib/meetingSegments";

/**
 * The segment rules, without a database.
 *
 * These decide the calendar's dot colour, the badge on every meeting card, and
 * the copy on the schedule list. A competition is a mirrored GitHub issue
 * with no meeting of its own, so all that is left is whether a meeting has
 * workshops.
 */

function structure(
  overrides: Partial<MeetingStructure> = {},
): MeetingStructure {
  return {
    kind: null,
    workshops: [],
    ...overrides,
  };
}

function segmentsOf(overrides: Partial<MeetingStructure> = {}) {
  return resolveMeetingSegments(structure(overrides)).segments;
}

describe("resolveMeetingSegments", () => {
  it("falls back to `open` when nothing is scheduled", () => {
    // Not an error state and not an empty one. A night with no workshops is a
    // real meeting the club still holds.
    expect(segmentsOf()).toEqual(["open"]);
  });

  it("never returns an empty set when there is no kind", () => {
    expect(segmentsOf().length).toBeGreaterThan(0);
  });

  it("calls a workshop night `workshop`", () => {
    expect(segmentsOf({ workshops: [{}] })).toEqual(["workshop"]);
  });

  it("keeps the derived set when an officer also named the night", () => {
    // A social that also runs a workshop is a real night, and the workshop
    // still has to reach the page. The caller renders the kind beside these.
    // It is not returned here: that would be a pass-through of a field every
    // call site already holds.
    const billing = resolveMeetingSegments(
      structure({ kind: "Social", workshops: [{}] }),
    );
    expect(billing.segments).toEqual(["workshop"]);
  });

  it("suppresses `open` when an officer named the night", () => {
    // `open` means structural silence and `kind` is the officer's word for a
    // night structure cannot describe, the same condition twice. Both
    // speaking would render "Unscheduled · Build Session", the fallback
    // contradicting the person who told us what the night was.
    expect(resolveMeetingSegments(structure({ kind: "Build Session" }))).toEqual({
      segments: [],
    });
  });

  it("still falls back to `open` when there is neither structure nor kind", () => {
    expect(resolveMeetingSegments(structure()).segments).toEqual(["open"]);
  });
});
