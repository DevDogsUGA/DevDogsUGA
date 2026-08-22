import { describe, expect, it } from "vitest";

/**
 * Imported from `~/lib/meetingSegments`, NOT from the loader that re-exports
 * them. The rules are pure and live there precisely so nothing needs a
 * database to exercise them — the loader's first import is `~/server/db`,
 * which resolves `~/env` at module load, so reaching them through it used to
 * require stubbing the database module out of the graph just to run arithmetic
 * on dates. Importing the pure module directly removes the stub and the reason
 * for it. Anything that genuinely touches `db` belongs in `queries.db-test.ts`.
 */
import {
  attendanceFormIsLive,
  isJudgedDuring,
  resolveMeetingSegments,
  type MeetingSegment,
  type MeetingStructure,
} from "~/lib/meetingSegments";

/**
 * The segment rules, without a database.
 *
 * These decide the calendar's dot colour, the badge on every meeting card, and
 * the copy on the schedule list. They are derived from structure rather than
 * read from a column, which means the failure they are exposed to is not a bad
 * row — it is a rule quietly disagreeing with the roster lock or with the
 * design note about what a night *is*. That drift does not need Postgres to
 * happen, so it should not need Postgres to catch.
 *
 * The scenarios below are the timeline from the design note: a meeting judges
 * the competition that opened last week and opens the next one, and a
 * supplementary workshop opens nothing at all.
 */

const MEETING = {
  startsAt: new Date("2026-09-10T22:00:00Z"),
  endsAt: new Date("2026-09-11T00:00:00Z"),
};

function structure(
  overrides: Partial<MeetingStructure> = {},
): MeetingStructure {
  return {
    kind: null,
    workshops: [],
    judgedCompetitions: [],
    ...overrides,
  };
}

/** A workshop that opened a competition. */
const KICKOFF = { competitionSlug: "sgf-week-2" };
/** A supplementary workshop: complete on its own, worth exactly one star. */
const SUPPLEMENTARY = { competitionSlug: null };

function segmentsOf(
  overrides: Partial<MeetingStructure> = {},
): MeetingSegment[] {
  return resolveMeetingSegments(structure(overrides)).segments;
}

describe("resolveMeetingSegments", () => {
  it("falls back to `open` when nothing is scheduled", () => {
    // Not an error state and not an empty one — a night with no workshops and
    // nothing to judge is a real meeting the club still holds.
    expect(segmentsOf()).toEqual(["open"]);
  });

  it("never returns an empty set", () => {
    expect(segmentsOf().length).toBeGreaterThan(0);
  });

  it("calls a supplementary workshop a workshop and nothing more", () => {
    // The case an inner join would have deleted. `workshop` without `kickoff`
    // is a complete, ordinary state rather than a competition that failed to
    // load, and asserting it here is what keeps somebody from "fixing" the
    // absence later.
    expect(segmentsOf({ workshops: [SUPPLEMENTARY] })).toEqual(["workshop"]);
  });

  it("adds `kickoff` alongside `workshop`, never instead of it", () => {
    // A caller filtering on `workshop` to list teaching nights must not miss
    // the night that taught AND opened a competition.
    expect(segmentsOf({ workshops: [KICKOFF] })).toEqual([
      "kickoff",
      "workshop",
    ]);
  });

  it("marks a kickoff when only one of several workshops opens a competition", () => {
    expect(segmentsOf({ workshops: [SUPPLEMENTARY, KICKOFF] })).toEqual([
      "kickoff",
      "workshop",
    ]);
  });

  it("judges and teaches on the same night", () => {
    // The ordinary mid-semester meeting from the design note: it judges the
    // competition that opened last week and opens the next one. Both facts
    // survive, which is the entire reason segments are a set.
    expect(
      segmentsOf({
        workshops: [KICKOFF],
        judgedCompetitions: [{ competitionId: "c1" }],
      }),
    ).toEqual(["judging", "kickoff", "workshop"]);
  });

  it("is a judging-only night when nothing is taught", () => {
    // A dedicated presentations night: a meeting with no workshops that a
    // competition points at. No special case in the model, so none here.
    expect(
      segmentsOf({ judgedCompetitions: [{ competitionId: "c1" }] }),
    ).toEqual(["judging"]);
  });

  it("puts the segment with a deadline behind it first", () => {
    // Callers take `segments[0]` as the primary for a dot colour or a narrow
    // badge, so the order is the contract, not an implementation detail.
    const [primary] = segmentsOf({
      workshops: [KICKOFF],
      judgedCompetitions: [{ competitionId: "c1" }],
    });
    expect(primary).toBe("judging");
  });

  it("keeps the officer override beside the derived set, not on top of it", () => {
    // A social that also runs a workshop is a real night. Merging the two
    // fields would drop the workshop from the page.
    const billing = resolveMeetingSegments(
      structure({ kind: "Social", workshops: [SUPPLEMENTARY] }),
    );
    expect(billing.kindOverride).toBe("Social");
    expect(billing.segments).toEqual(["workshop"]);
  });

  it("passes through a `kind` this codebase has never heard of", () => {
    // It is an Airtable single-select an officer can extend without a
    // migration, so an unknown value has to arrive intact rather than be
    // normalised away.
    expect(
      resolveMeetingSegments(structure({ kind: "Pizza" })).kindOverride,
    ).toBe("Pizza");
  });

  it("reports no override when there is none", () => {
    expect(resolveMeetingSegments(structure()).kindOverride).toBeNull();
  });
});

describe("isJudgedDuring", () => {
  it("attaches judging that starts inside the meeting", () => {
    expect(isJudgedDuring(MEETING, new Date("2026-09-10T22:40:00Z"))).toBe(
      true,
    );
  });

  it("includes the meeting's own start instant", () => {
    expect(isJudgedDuring(MEETING, MEETING.startsAt)).toBe(true);
  });

  it("excludes the end instant, so adjacent meetings cannot both claim it", () => {
    // Half-open. A competition judged exactly when the next meeting begins
    // belongs to that one, and to only one.
    expect(isJudgedDuring(MEETING, MEETING.endsAt)).toBe(false);
  });

  it("treats a null judging time as not scheduled, not as judged here", () => {
    // Null means "not yet on the calendar", never "never". Counting it as
    // judged at the labelled meeting would put a deadline on the page that
    // nobody authored — and the roster lock, which reads the same datetime,
    // would disagree.
    expect(isJudgedDuring(MEETING, null)).toBe(false);
  });

  it("rejects a judging time from another week entirely", () => {
    // `judgingMeetingId` may well point at this meeting while the datetime
    // says otherwise; the datetime wins, because every other predicate in the
    // codebase reads it.
    expect(isJudgedDuring(MEETING, new Date("2026-09-17T22:00:00Z"))).toBe(
      false,
    );
  });
});

describe("attendanceFormIsLive", () => {
  // Guarding the narrower claim the function deliberately makes: there is a
  // link and the meeting is happening. It does not and cannot claim the
  // Airtable form is open.
  const form = { ...MEETING, attendanceFormUrl: "https://airtable.com/form" };

  it("is live during the meeting when there is a link", () => {
    expect(attendanceFormIsLive(form, new Date("2026-09-10T23:00:00Z"))).toBe(
      true,
    );
  });

  it("is not live without a link, however open the form may be", () => {
    expect(
      attendanceFormIsLive(
        { ...form, attendanceFormUrl: null },
        new Date("2026-09-10T23:00:00Z"),
      ),
    ).toBe(false);
  });

  it("is not live before the meeting or after it ends", () => {
    expect(attendanceFormIsLive(form, new Date("2026-09-10T21:59:00Z"))).toBe(
      false,
    );
    expect(attendanceFormIsLive(form, MEETING.endsAt)).toBe(false);
  });
});
