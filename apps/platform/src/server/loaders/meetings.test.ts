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
    workshops: [],
    ...overrides,
  };
}

function segmentsOf(overrides: Partial<MeetingStructure> = {}) {
  return resolveMeetingSegments(structure(overrides)).segments;
}

describe("resolveMeetingSegments", () => {
  it("is empty when nothing is scheduled: there is no `open` fallback", () => {
    // A night with no workshops is a real meeting the club still holds. Its
    // chip is its category's; nothing prints an "Unscheduled" label.
    expect(segmentsOf()).toEqual([]);
  });

  it("calls a workshop night `workshop`", () => {
    expect(segmentsOf({ workshops: [{}] })).toEqual(["workshop"]);
  });

  it("keeps `workshop` however many workshops run", () => {
    expect(segmentsOf({ workshops: [{}, {}] })).toEqual(["workshop"]);
  });
});
