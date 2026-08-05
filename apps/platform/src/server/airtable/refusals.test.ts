import { describe, expect, it } from "vitest";
import {
  checkCompetition,
  checkWorkshop,
  type CompetitionFacts,
  type WorkshopFacts,
} from "./refusals";

/**
 * One test per refusal rule, because these are the rules that protect credit
 * people have already earned and arithmetic that has already been published.
 *
 * Each rule gets three cases and the third is the one that matters: the edit
 * is refused when it would destroy something, allowed when it would not, and
 * — the case that is easy to get wrong — allowed when the officer is simply
 * mid-edit and the field has not arrived yet.
 */

const WORKSHOP: WorkshopFacts = {
  airtableRecordId: "recWorkshop",
  attendanceCount: 12,
  currentMeetingId: "meeting-a",
  currentProjectId: "project-a",
};

describe("workshops with attendance", () => {
  it("refuses a changed meeting", () => {
    const result = checkWorkshop(WORKSHOP, {
      meetingId: "meeting-b",
      projectId: "project-a",
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "workshop_meeting_changed",
    ]);
    expect(result.rejectedFields.has("meetingId")).toBe(true);
    // The count is in the message: an officer needs to know how much credit is
    // at stake to decide what to do instead.
    expect(result.refusals[0]!.message).toContain("12");
  });

  it("refuses a changed project", () => {
    const result = checkWorkshop(WORKSHOP, {
      meetingId: "meeting-a",
      projectId: "project-b",
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "workshop_project_changed",
    ]);
    expect(result.rejectedFields.has("projectId")).toBe(true);
  });

  it("refuses each field independently", () => {
    const result = checkWorkshop(WORKSHOP, {
      meetingId: "meeting-b",
      projectId: "project-b",
    });

    // Two refusals, not one "this row is frozen" — an officer who changed two
    // things needs to be told about both.
    expect(result.refusals).toHaveLength(2);
    expect(result.rejectedFields).toEqual(new Set(["meetingId", "projectId"]));
  });

  it("allows any edit to a workshop nobody attended", () => {
    const result = checkWorkshop(
      { ...WORKSHOP, attendanceCount: 0 },
      { meetingId: "meeting-b", projectId: "project-b" },
    );

    expect(result.refusals).toEqual([]);
    expect(result.rejectedFields.size).toBe(0);
  });

  it("treats an unfilled link as no change, not as a clear", () => {
    // The mid-edit case. A pass landing between two keystrokes must not write
    // a complaint into a row that will be complete thirty seconds later.
    const result = checkWorkshop(WORKSHOP, {
      meetingId: null,
      projectId: null,
    });

    expect(result.refusals).toEqual([]);
  });
});

const COMPETITION: CompetitionFacts = {
  airtableRecordId: "recCompetition",
  isFinalized: false,
  participationFrozen: false,
  currentRequirementCount: 5,
  currentJudgingStartsAt: new Date("2026-04-10T18:00:00Z"),
  workshopMeetingStartsAt: new Date("2026-04-03T18:00:00Z"),
};

describe("requirementCount after finalize", () => {
  it("refuses once standings are published", () => {
    const result = checkCompetition(
      { ...COMPETITION, isFinalized: true },
      { requirementCount: 6, judgingStartsAt: null },
    );

    expect(result.refusals.map((r) => r.code)).toEqual([
      "requirement_count_after_finalize",
    ]);
  });

  it("allows the same edit before the tally has run", () => {
    const result = checkCompetition(COMPETITION, {
      requirementCount: 6,
      judgingStartsAt: null,
    });

    expect(result.refusals).toEqual([]);
  });

  it("allows a no-op write to a finalized competition", () => {
    // Airtable re-sends the whole record every pass, so the unchanged value
    // arrives on every single sync. Refusing it would put a permanent refusal
    // on every finalized competition in the base.
    const result = checkCompetition(
      { ...COMPETITION, isFinalized: true },
      { requirementCount: 5, judgingStartsAt: null },
    );

    expect(result.refusals).toEqual([]);
  });
});

describe("judgingStartsAt", () => {
  it("refuses a move after participation freezes", () => {
    const result = checkCompetition(
      { ...COMPETITION, participationFrozen: true },
      {
        requirementCount: null,
        judgingStartsAt: new Date("2026-04-17T18:00:00Z"),
      },
    );

    expect(result.refusals.map((r) => r.code)).toEqual([
      "judging_moved_after_freeze",
    ]);
  });

  it("refuses a time at or before the opening workshop's meeting", () => {
    const result = checkCompetition(COMPETITION, {
      requirementCount: null,
      judgingStartsAt: new Date("2026-04-01T18:00:00Z"),
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "judging_before_workshop",
    ]);
  });

  it("refuses a time exactly at the meeting start", () => {
    const result = checkCompetition(COMPETITION, {
      requirementCount: null,
      judgingStartsAt: new Date("2026-04-03T18:00:00Z"),
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "judging_before_workshop",
    ]);
  });

  it("allows rescheduling before the freeze", () => {
    const result = checkCompetition(COMPETITION, {
      requirementCount: null,
      judgingStartsAt: new Date("2026-04-17T18:00:00Z"),
    });

    expect(result.refusals).toEqual([]);
  });

  it("allows the unchanged value after the freeze", () => {
    const result = checkCompetition(
      { ...COMPETITION, participationFrozen: true },
      {
        requirementCount: null,
        judgingStartsAt: new Date("2026-04-10T18:00:00Z"),
      },
    );

    expect(result.refusals).toEqual([]);
  });

  it("allows a first schedule on a competition that had none", () => {
    // A null judgingStartsAt means "not scheduled yet", never "never" — so
    // filling it in is not a move.
    const result = checkCompetition(
      { ...COMPETITION, currentJudgingStartsAt: null },
      {
        requirementCount: null,
        judgingStartsAt: new Date("2026-04-10T18:00:00Z"),
      },
    );

    expect(result.refusals).toEqual([]);
  });

  it("does not refuse a competition whose workshop meeting is unknown", () => {
    const result = checkCompetition(
      { ...COMPETITION, workshopMeetingStartsAt: null },
      {
        requirementCount: null,
        judgingStartsAt: new Date("2026-01-01T18:00:00Z"),
      },
    );

    expect(result.refusals).toEqual([]);
  });
});

describe("both rules on one record", () => {
  it("applies the team-size edit while refusing the graded one", () => {
    const result = checkCompetition(
      { ...COMPETITION, isFinalized: true, participationFrozen: true },
      {
        requirementCount: 9,
        judgingStartsAt: new Date("2026-05-01T18:00:00Z"),
      },
    );

    expect(result.refusals.map((r) => r.code).sort()).toEqual([
      "judging_moved_after_freeze",
      "requirement_count_after_finalize",
    ]);
    // Rejection is per field, so anything not named here still gets written.
    expect(result.rejectedFields).toEqual(
      new Set(["requirementCount", "judgingStartsAt"]),
    );
  });
});
