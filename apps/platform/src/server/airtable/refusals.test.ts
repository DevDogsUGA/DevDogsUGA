import { describe, expect, it } from "vitest";
import {
  describeIncompleteMeeting,
  describeUnbuiltWorkshop,
  checkCompetition,
  checkProject,
  checkCompetitionValues,
  checkMeeting,
  checkWorkshop,
  checkWorkshopValues,
  type CompetitionFacts,
  type MeetingFacts,
  type WorkshopFacts,
} from "./refusals";
import {
  MEETING_CANCELLATION_REASON_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  MEETING_NAME_OVERRIDE_MAX_LENGTH,
  MEETING_SUMMARY_MAX_LENGTH,
  WORKSHOP_DESCRIPTION_MAX_LENGTH,
  WORKSHOP_TITLE_MAX_LENGTH,
  competitions as competitionsSpec,
  meetings as meetingsSpec,
  projects as projectsSpec,
  parseRsvpUrl,
  workshops as workshopsSpec,
} from "@devdogsuga/airtable";

/**
 * One test per refusal rule, because these rules protect credit people have
 * already earned and arithmetic that has already been published.
 *
 * Each rule gets three cases and the third is the one that matters: refused
 * when the edit would destroy something, allowed when it would not, and
 * allowed when the officer is mid-edit and the field has not arrived yet.
 */

/**
 * `checkMeeting` is the other class of rule, see the note at the top of
 * `refusals.ts`. Nothing here protects credit already earned; these say only
 * that a value cannot go on a public page as written.
 *
 * Which makes the empty case the one that matters most. A blank Summary and a
 * blank RSVP are the ORDINARY state of a meeting, so a rule that complained
 * about them would put a permanent refusal on every row in the base and
 * destroy `⚙️ Sync status` as a signal.
 *
 * The facts are built through the real parser rather than by hand, because
 * "present but the parser refused it" is the whole distinction under test and
 * asserting it against a hand-written null would assert nothing.
 */
const summaryParse = meetingsSpec.fields.summary.parse;
const rsvpParse = meetingsSpec.fields.rsvpUrl.parse;
const reasonParse = meetingsSpec.fields.cancellationReason.parse;
const nameParse = meetingsSpec.fields.nameOverride.parse;
const formParse = meetingsSpec.fields.attendanceForm.parse;

function meetingFacts(raw: {
  summary?: string;
  rsvpUrl?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  nameOverride?: string;
  attendanceForm?: string;
}): MeetingFacts {
  return {
    airtableRecordId: "recMeeting",
    // Airtable omits an empty field from `fields` entirely rather than
    // returning null, so `undefined` is what absence actually looks like.
    rawSummary: raw.summary,
    summary: summaryParse(raw.summary),
    rawRsvpUrl: raw.rsvpUrl,
    rsvpUrl: rsvpParse(raw.rsvpUrl),
    cancelledAt: raw.cancelledAt ?? null,
    rawCancellationReason: raw.cancellationReason,
    cancellationReason: reasonParse(raw.cancellationReason),
    rawNameOverride: raw.nameOverride,
    nameOverride: nameParse(raw.nameOverride),
    rawAttendanceForm: raw.attendanceForm,
    attendanceForm: formParse(raw.attendanceForm),
  };
}

const RSVP = "https://uga.campuslabs.com/engage/event/12345678";

describe("meeting summary", () => {
  it("stays silent on a meeting with nothing written", () => {
    // The ordinary case, and the one a wrong rule would ruin: most weeks have
    // no summary and no RSVP, forever, and that is not a problem to report.
    const result = checkMeeting(meetingFacts({}));

    expect(result.refusals).toEqual([]);
    expect(result.rejectedFields.size).toBe(0);
  });

  it("stays silent on a field holding only whitespace", () => {
    // Nobody meant a stray keystroke, and complaining about one is noise.
    const result = checkMeeting(meetingFacts({ summary: "   \n  " }));

    expect(result.refusals).toEqual([]);
  });

  it("publishes a summary that fits", () => {
    const facts = meetingFacts({
      summary: "  Lightning talks,  then pizza.\nBring a laptop.  ",
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    // Trimmed and collapsed, so the count means the same thing as the layout.
    expect(facts.summary).toBe("Lightning talks, then pizza. Bring a laptop.");
  });

  it("refuses a summary longer than the card", () => {
    const long = "x".repeat(MEETING_SUMMARY_MAX_LENGTH + 172);
    const facts = meetingFacts({ summary: long });

    const result = checkMeeting(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "meeting_summary_too_long",
    ]);
    expect(result.rejectedFields.has("summary")).toBe(true);
    // Both numbers are in the message: an officer needs to know how far over
    // they are, not just that they are over.
    expect(result.refusals[0]!.message).toContain(String(long.length));
    expect(result.refusals[0]!.message).toContain(
      String(MEETING_SUMMARY_MAX_LENGTH),
    );
    // Never truncated. Half a sentence under an officer's name on a public
    // page, with no way for them to know, is worse than nothing at all.
    expect(facts.summary).toBeNull();
  });

  it("accepts a summary exactly at the limit", () => {
    const facts = meetingFacts({
      summary: "x".repeat(MEETING_SUMMARY_MAX_LENGTH),
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.summary).toHaveLength(MEETING_SUMMARY_MAX_LENGTH);
  });
});

describe("meeting RSVP", () => {
  it("publishes an Involvement Network event link", () => {
    const facts = meetingFacts({ rsvpUrl: RSVP });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.rsvpUrl).toBe(RSVP);
  });

  it("refuses a host that is not allowlisted", () => {
    // Well-formed, https, and pointing at somewhere the club is not. Exactly
    // what a mispaste looks like, and exactly what a scheme-only check misses.
    const result = checkMeeting(
      meetingFacts({ rsvpUrl: "https://forms.gle/abcdef" }),
    );

    expect(result.refusals.map((r) => r.code)).toEqual(["meeting_rsvp_host"]);
    expect(result.rejectedFields.has("rsvpUrl")).toBe(true);
    // The value is quoted back, so the officer can see what actually landed in
    // the cell rather than guessing which of two links they pasted.
    expect(result.refusals[0]!.message).toContain("https://forms.gle/abcdef");
  });

  it("refuses a javascript: URI", () => {
    const result = checkMeeting(
      meetingFacts({ rsvpUrl: "javascript:alert(1)" }),
    );

    expect(result.refusals.map((r) => r.code)).toEqual(["meeting_rsvp_host"]);
  });

  it("refuses http on an allowlisted host", () => {
    const result = checkMeeting(
      meetingFacts({ rsvpUrl: "http://uga.campuslabs.com/engage/event/1" }),
    );

    expect(result.refusals.map((r) => r.code)).toEqual(["meeting_rsvp_host"]);
  });

  it("canonicalizes a mixed-case host rather than refusing it", () => {
    // The host allowlist compares case-insensitively; the
    // `meetings_rsvpUrl_host` check constraint does not. Returning the
    // officer's text verbatim would let a value through the parser that the
    // insert rejects, and a constraint violation inside the pull fails the
    // whole sync pass, for every table, rather than one field.
    const facts = meetingFacts({
      rsvpUrl: "https://UGA.CampusLabs.com/engage/event/12345678",
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.rsvpUrl).toBe(RSVP);
  });

  it("refuses a credentialled URL on an allowlisted host", () => {
    // `new URL()` parses this happily and reports the allowlisted hostname, so
    // a host check alone would let it through. It would then fail the
    // `meetings_rsvpUrl_host` constraint at insert and take the pass down.
    const result = checkMeeting(
      meetingFacts({ rsvpUrl: "https://someone@uga.campuslabs.com/engage" }),
    );

    expect(result.refusals.map((r) => r.code)).toEqual(["meeting_rsvp_host"]);
  });

  it("refuses malformed garbage without throwing", () => {
    // `new URL()` throws on every one of these. `applyPull` runs the parser
    // inside a bare `.map()`, so an exception here would not skip one row. It
    // would fail the entire sync pass, for every table.
    for (const garbage of [
      "not a url",
      "https://",
      "://uga.campuslabs.com",
      "?",
    ]) {
      expect(() => parseRsvpUrl(garbage)).not.toThrow();
      expect(parseRsvpUrl(garbage)).toBeNull();

      const result = checkMeeting(meetingFacts({ rsvpUrl: garbage }));
      expect(result.refusals.map((r) => r.code)).toEqual(["meeting_rsvp_host"]);
    }
  });

  it("refuses each field independently", () => {
    const result = checkMeeting(
      meetingFacts({
        summary: "x".repeat(MEETING_SUMMARY_MAX_LENGTH + 1),
        rsvpUrl: "https://example.com/rsvp",
      }),
    );

    expect(result.refusals.map((r) => r.code).sort()).toEqual([
      "meeting_rsvp_host",
      "meeting_summary_too_long",
    ]);
    expect(result.rejectedFields).toEqual(new Set(["summary", "rsvpUrl"]));
  });

  it("leaves a good summary alone when only the RSVP is wrong", () => {
    // Rejection is per field. An officer who fixed the summary and mispasted
    // the link should get the summary published and one complaint, not two.
    const result = checkMeeting(
      meetingFacts({ summary: "Career night.", rsvpUrl: "nope" }),
    );

    expect(result.rejectedFields).toEqual(new Set(["rsvpUrl"]));
  });
});

const CANCELLED = "2026-09-21T18:00:00.000Z";

/**
 * The pair `meetings_cancellationReason_needs_cancellation` enforces.
 *
 * These are not cosmetic. The constraint rejects a reason with no date, and a
 * violation raised inside `pullMeetings` is not a refused field. It is an
 * exception mid-loop that takes the whole fifteen-minute pull down, for every
 * table, until somebody edits the cell that caused it. So the rule that keeps
 * the two in step is worth a test per ordering an officer can type them in.
 */
describe("meeting cancellation", () => {
  it("stays silent on a night that is simply on", () => {
    const result = checkMeeting(meetingFacts({}));

    expect(result.refusals).toEqual([]);
    expect(result.rejectedFields.size).toBe(0);
  });

  it("publishes a reason beside its date", () => {
    const facts = meetingFacts({
      cancelledAt: CANCELLED,
      cancellationReason: "Campus closed.",
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.cancellationReason).toBe("Campus closed.");
  });

  it("stays silent on a cancellation with no reason", () => {
    // The ordinary case: the fact and the explanation arrive in separate
    // keystrokes, and the page states the fact without one. A rule that
    // complained here would fire on every cancellation the club ever makes.
    const result = checkMeeting(meetingFacts({ cancelledAt: CANCELLED }));

    expect(result.refusals).toEqual([]);
  });

  it("refuses a reason typed before the date", () => {
    const result = checkMeeting(
      meetingFacts({ cancellationReason: "Campus closed." }),
    );

    expect(result.refusals.map((r) => r.code)).toEqual([
      "meeting_reason_without_cancellation",
    ]);
    // NOT rejected: the caller has to write null rather than drop the key,
    // or an un-cancellation leaves the old reason behind and the next write
    // is the constraint violation this exists to prevent.
    expect(result.rejectedFields.has("cancellationReason")).toBe(false);
  });

  it("names both halves of the pair, so the fix is obvious", () => {
    const result = checkMeeting(
      meetingFacts({ cancellationReason: "Campus closed." }),
    );

    expect(result.refusals[0]!.message).toContain("Cancelled");
    expect(result.refusals[0]!.message).toContain("Cancellation reason");
  });

  it("stays silent on whitespace with no date", () => {
    // Same floor as every other field here: nobody meant a stray keystroke.
    const result = checkMeeting(meetingFacts({ cancellationReason: "  \n " }));

    expect(result.refusals).toEqual([]);
  });

  it("refuses a reason longer than the notice, and keeps the cancellation", () => {
    const long = "x".repeat(MEETING_CANCELLATION_REASON_MAX_LENGTH + 40);
    const facts = meetingFacts({
      cancelledAt: CANCELLED,
      cancellationReason: long,
    });

    const result = checkMeeting(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "meeting_cancellation_reason_too_long",
    ]);
    // Rejected here, unlike the unpaired case: the night IS cancelled, so the
    // old reason stays up for the same reason an over-long summary leaves the
    // published one alone.
    expect(result.rejectedFields.has("cancellationReason")).toBe(true);
    expect(result.refusals[0]!.message).toContain(String(long.length));
    expect(facts.cancellationReason).toBeNull();
  });

  it("accepts a reason exactly at the limit", () => {
    const facts = meetingFacts({
      cancelledAt: CANCELLED,
      cancellationReason: "x".repeat(MEETING_CANCELLATION_REASON_MAX_LENGTH),
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.cancellationReason).toHaveLength(
      MEETING_CANCELLATION_REASON_MAX_LENGTH,
    );
  });

  it("reports the unpaired reason once, alongside an unrelated refusal", () => {
    // Per field, not per record: an officer who typed a reason early and an
    // RSVP wrong should hear about both.
    const result = checkMeeting(
      meetingFacts({ rsvpUrl: "nope", cancellationReason: "Campus closed." }),
    );

    expect(result.refusals.map((r) => r.code).sort()).toEqual([
      "meeting_reason_without_cancellation",
      "meeting_rsvp_host",
    ]);
  });
});

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
      projectCleared: false,
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
      projectCleared: false,
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
      projectCleared: false,
    });

    // Two refusals, not one "this row is frozen". An officer who changed two
    // things needs to be told about both.
    expect(result.refusals).toHaveLength(2);
    expect(result.rejectedFields).toEqual(new Set(["meetingId", "projectId"]));
  });

  it("allows any edit to a workshop nobody attended", () => {
    const result = checkWorkshop(
      { ...WORKSHOP, attendanceCount: 0 },
      { meetingId: "meeting-b", projectId: "project-b", projectCleared: false },
    );

    expect(result.refusals).toEqual([]);
    expect(result.rejectedFields.size).toBe(0);
  });

  it("treats an unfilled link as no change, not as a clear", () => {
    // The mid-edit case. A pass landing between two keystrokes must not write
    // a complaint into a row that is complete thirty seconds later.
    const result = checkWorkshop(WORKSHOP, {
      meetingId: null,
      projectId: null,
      projectCleared: false,
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
    // A null judgingStartsAt means "not scheduled yet", never "never", so
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

describe("describeIncompleteMeeting", () => {
  /**
   * A row below the completeness bar used to be skipped in total silence, so
   * a half-filled meeting and one the sync had never reached looked identical
   * in the grid: clean status, nothing on the site, no way to tell which.
   *
   * These assertions are about WORDING, which is unusual for a test and
   * deliberate. Officers fill fields one at a time, and a pass landing between
   * two keystrokes must not complain, so the only thing separating "a state"
   * from "a complaint" is how it reads.
   */
  const missingEnd = {
    startsAt: "2026-09-01T22:00",
    endsAt: null,
  };

  it("names what is missing, not the rule that rejected it", () => {
    const message = describeIncompleteMeeting(missingEnd, false);
    expect(message).toContain("an end time");
    // The fields that ARE filled in go unmentioned: the officer is looking at
    // the row and wants the next keystroke.
    expect(message).not.toContain("a name");
    expect(message).not.toContain("a start time");
  });

  it("lists several missing fields the way a person would write them", () => {
    const message = describeIncompleteMeeting(
      { startsAt: null, endsAt: null },
      false,
    );
    expect(message).toContain("a start time and an end time");
  });

  it("never asks for a name", () => {
    // Most nights have none by design, since the heading is derived from the
    // workshops and the judging, so reporting its absence would flag the
    // ordinary case as a fault, every week, in an officer's sync-status cell.
    const message = describeIncompleteMeeting(
      { startsAt: null, endsAt: null },
      false,
    );
    expect(message).not.toContain("a name");
  });

  it("describes a bad ORDER rather than claiming something is absent", () => {
    // Every field arrived; the end is not after the start. Saying "still needs
    // an end time" here would send an officer to a field that is filled in.
    const message = describeIncompleteMeeting(
      {
        startsAt: "2026-09-01T23:00",
        endsAt: "2026-09-01T22:00",
      },
      false,
    );
    expect(message).toContain("end time at or before its start time");
    expect(message).not.toContain("still needs");
  });

  it("does not say a published meeting is missing from the site", () => {
    // ⚠️ The half that is easy to get wrong. A row already in Postgres keeps
    // serving its previous values, so "not on the site yet" would be false and
    // would send somebody looking for a page that is up.
    const published = describeIncompleteMeeting(missingEnd, true);
    expect(published).not.toContain("Not on the site yet");
    expect(published).toContain("previous version");
  });

  it("reads as a state rather than a complaint", () => {
    // The distinction the whole entry rests on: nothing was rejected, and the
    // officer has not done anything wrong.
    const message = describeIncompleteMeeting(missingEnd, false);
    expect(message).toContain("Nothing is wrong with what you have entered");
    expect(message).not.toMatch(/refus|reject|invalid|error/i);
  });
});

/**
 * The rules below guard CHECK CONSTRAINTS rather than layouts, which makes
 * them a different kind of test from the ones above.
 *
 * A missing summary rule costs a bad card. A missing rule here cost the whole
 * pass: the value reached Postgres, the constraint rejected the write, and the
 * exception unwound past every table left in the run, while `writeSyncStatus`
 * sat inside the same `try`, so nothing was reported anywhere. One officer
 * typing one character too many stopped the entire sync and left a clean grid
 * behind it.
 *
 * So each of these asserts the refusal AND that the parser really returns null
 * for the value, because a rule that fires while the parser still accepts the
 * text would let the write through regardless.
 */
describe("describeUnbuiltWorkshop", () => {
  /**
   * The insert path in `pullWorkshops` had two silent `continue`s, and this is
   * what replaced them.
   *
   * Silence was the whole bug. A workshop whose Meeting had not synced, or
   * whose Project link named a Projects row the platform does not own, sat in
   * the base with a clean status cell and no row in Postgres, pass after pass.
   * From the officer's side that is "workshops aren't syncing", with nothing
   * anywhere naming a cause.
   *
   * Like `describeIncompleteMeeting`, these assert WORDING, and for the same
   * reason: the meeting case is a row that will finish itself and must not be
   * complained at, and the project case is one that will not and must not be
   * described as waiting.
   */
  const built = {
    hasMeetingLink: true,
    meetingResolved: true,
    hasProjectLink: true,
    projectResolved: true,
  };

  it("says nothing about a workshop that will be inserted", () => {
    expect(describeUnbuiltWorkshop(built)).toBeNull();
  });

  it("says nothing about a workshop with no project, which is legal now", () => {
    // `projectId` became nullable with the events rework: a career-readiness
    // session belongs to no codebase and never will.
    expect(
      describeUnbuiltWorkshop({
        ...built,
        hasProjectLink: false,
        projectResolved: false,
      }),
    ).toBeNull();
  });

  it("asks for the meeting when the cell is empty", () => {
    const result = describeUnbuiltWorkshop({
      ...built,
      hasMeetingLink: false,
      meetingResolved: false,
    })!;
    expect(result.code).toBe("workshop_incomplete");
    expect(result.message).toContain("needs a Meeting");
    // A state, not a complaint. This row is thirty seconds from being right.
    expect(result.message).toContain("Not on the site yet");
  });

  it("points at the meeting's own row when the link does not resolve", () => {
    const result = describeUnbuiltWorkshop({
      ...built,
      meetingResolved: false,
    })!;
    expect(result.code).toBe("workshop_incomplete");
    expect(result.message).toContain("⚙️ Sync status");
  });

  it("names the meeting first when both links are unresolved", () => {
    // The meeting is the required one, so it is the next keystroke. Reporting
    // the project instead would send an officer to fix the cell that is not
    // blocking the row.
    const result = describeUnbuiltWorkshop({
      hasMeetingLink: false,
      meetingResolved: false,
      hasProjectLink: true,
      projectResolved: false,
    })!;
    expect(result.code).toBe("workshop_incomplete");
  });

  it("points at the project's own row when the link does not resolve", () => {
    // This used to describe a PERMANENT dead end: projects were pushed, so a
    // Projects row created from the link picker had no ⚙️ Platform ID and
    // never got one. Projects are pulled now, so the row resolves on its own
    // once it has a name — the same shape as the meeting case, keeping a code
    // of its own because the officer has to look at a different row.
    const result = describeUnbuiltWorkshop({
      ...built,
      projectResolved: false,
    })!;
    expect(result.code).toBe("workshop_project_unknown");
    expect(result.message).toContain("⚙️ Sync status");
    // Still worth saying, because a workshop genuinely may not have one.
    expect(result.message).toContain("Clear the cell");
  });
});

describe("project names", () => {
  /**
   * The only value rule projects have, and it did not exist until the table
   * changed direction.
   *
   * `projects."displayName"` had no length constraint at all while the
   * platform wrote it, because a value the platform authored could not
   * surprise it. Officer-authored, it guards a check constraint, and a rule
   * guarding a constraint is the kind whose absence costs the whole pass
   * rather than one bad card.
   */
  const named = (name: string) => ({
    airtableRecordId: "recP",
    rawDisplayName: name,
    displayName:
      name.trim().length > 0 && name.trim().length <= PROJECT_NAME_MAX_LENGTH
        ? name.trim()
        : null,
  });

  it("passes an ordinary name", () => {
    expect(checkProject(named("Optimal Schedule Builder")).refusals).toEqual(
      [],
    );
  });

  it("stays silent on an empty cell", () => {
    // Not a refusal: a project an officer has not named yet is an unfinished
    // row, and `pullProjects` reports that as a state instead. Complaining
    // here would fire on every half-typed row.
    const result = checkProject({
      airtableRecordId: "recP",
      rawDisplayName: "",
      displayName: null,
    });
    expect(result.refusals).toEqual([]);
  });

  it("refuses a name past the cap and drops the field", () => {
    const result = checkProject(named("P".repeat(PROJECT_NAME_MAX_LENGTH + 1)));
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("project_name_too_long");
    expect(result.refusals[0]!.table).toBe("projects");
    expect(result.rejectedFields).toEqual(new Set(["displayName"]));
  });

  it("allows exactly the cap", () => {
    // The boundary the check constraint is written at. One test either side,
    // because `<=` and `<` are the same length in a diff.
    expect(
      checkProject(named("P".repeat(PROJECT_NAME_MAX_LENGTH))).refusals,
    ).toEqual([]);
  });

  it("agrees with the registry parser about what is too long", () => {
    // A rule that fires while the parser still ACCEPTS the value would let the
    // write through anyway and the constraint would abort the pass. The two
    // have to draw the line in the same place.
    const tooLong = "P".repeat(PROJECT_NAME_MAX_LENGTH + 1);
    expect(projectsSpec.fields.displayName.parse(tooLong)).toBeNull();
  });
});

describe("meeting name", () => {
  it("stays silent when no name is written", () => {
    // The ordinary case, and by a wide margin: most nights have no name at
    // all, since the heading is built from the workshops and the judging.
    expect(checkMeeting(meetingFacts({})).refusals).toEqual([]);
  });

  it("refuses a name longer than a schedule row", () => {
    const long = "x".repeat(MEETING_NAME_OVERRIDE_MAX_LENGTH + 1);
    const facts = meetingFacts({ nameOverride: long });

    const result = checkMeeting(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "meeting_name_too_long",
    ]);
    expect(result.rejectedFields.has("nameOverride")).toBe(true);
    expect(result.refusals[0]!.message).toContain(String(long.length));
    // The half that matters: the parser refused it too, so the caller has a
    // null to drop rather than an 81-character string to write.
    expect(facts.nameOverride).toBeNull();
  });

  it("accepts a name exactly at the limit", () => {
    const facts = meetingFacts({
      nameOverride: "x".repeat(MEETING_NAME_OVERRIDE_MAX_LENGTH),
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.nameOverride).toHaveLength(MEETING_NAME_OVERRIDE_MAX_LENGTH);
  });
});

describe("meeting attendance form", () => {
  it("stays silent when no form is written", () => {
    // A meeting with no workshop has no form, and one whose officer has not
    // made this week's yet is still a meeting.
    expect(checkMeeting(meetingFacts({})).refusals).toEqual([]);
  });

  it("accepts an Airtable share link", () => {
    const facts = meetingFacts({
      attendanceForm: "https://airtable.com/shrABCDEF123456",
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.attendanceForm).toBe("https://airtable.com/shrABCDEF123456");
  });

  it("refuses a form on any other host", () => {
    // The realistic mispaste: an officer who made this week's form in Google
    // Forms out of habit.
    const facts = meetingFacts({
      attendanceForm: "https://docs.google.com/forms/d/e/1FAIpQ/viewform",
    });

    const result = checkMeeting(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "meeting_attendance_form_host",
    ]);
    expect(result.rejectedFields.has("attendanceFormUrl")).toBe(true);
    expect(facts.attendanceForm).toBeNull();
  });

  it("refuses a credential-carrying url on the allowed host", () => {
    // `new URL` accepts this and the hostname passes, so only the shape check
    // stops it, and `meetings_attendanceFormUrl_airtable` would reject it.
    const facts = meetingFacts({
      attendanceForm: "https://someone@airtable.com/shrABC",
    });

    expect(checkMeeting(facts).refusals.map((r) => r.code)).toEqual([
      "meeting_attendance_form_host",
    ]);
    expect(facts.attendanceForm).toBeNull();
  });
});

describe("the cancellation pair reports both faults at once", () => {
  it("fires the length rule even when the date is missing", () => {
    // ⚠️ The regression this exists to hold down. These two used to be an
    // `if`/`else if`, so an officer who typed 220 characters BEFORE setting
    // Cancelled was told only "set Cancelled and both appear within fifteen
    // minutes". Untrue, and it cost them a second fifteen-minute round trip to
    // learn about a fault that was knowable on the first pass.
    const long = "x".repeat(MEETING_CANCELLATION_REASON_MAX_LENGTH + 40);

    const result = checkMeeting(meetingFacts({ cancellationReason: long }));

    expect(result.refusals.map((r) => r.code).sort()).toEqual([
      "meeting_cancellation_reason_too_long",
      "meeting_reason_without_cancellation",
    ]);
  });

  it("does not promise the explanation is the only thing missing", () => {
    // A refused reason is DROPPED from the write, so a previously published
    // explanation stays on the page. The old wording said "only the
    // explanation is missing", which sent an officer to look at a site that
    // was still showing one.
    const result = checkMeeting(
      meetingFacts({
        cancelledAt: CANCELLED,
        cancellationReason: "x".repeat(
          MEETING_CANCELLATION_REASON_MAX_LENGTH + 1,
        ),
      }),
    );

    expect(result.refusals[0]!.message).not.toContain("only the explanation");
  });
});

describe("clearing a workshop's project", () => {
  it("refuses the clear once anybody has been credited", () => {
    // ⚠️ The data loss this file exists to prevent, and the one case that got
    // through: `workshop_project_changed` only fires for a project that
    // DIFFERS, and an emptied cell arrives as null, which every other rule
    // here reads as "not a change". `memberStars` groups on `w."projectId"`,
    // so the write took the project off stars twelve people had earned.
    const result = checkWorkshop(WORKSHOP, {
      meetingId: "meeting-a",
      projectId: null,
      projectCleared: true,
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "workshop_project_cleared",
    ]);
    expect(result.rejectedFields.has("projectId")).toBe(true);
    expect(result.refusals[0]!.message).toContain("12");
  });

  it("allows the clear on a workshop nobody attended", () => {
    // Unlinking a session that turned out to teach a skill rather than a
    // codebase is the reason the column is nullable. It stays legal right up
    // until somebody has been credited for it.
    const result = checkWorkshop(
      { ...WORKSHOP, attendanceCount: 0 },
      { meetingId: "meeting-a", projectId: null, projectCleared: true },
    );

    expect(result.refusals).toEqual([]);
  });

  it("allows the clear when there was no project to begin with", () => {
    const result = checkWorkshop(
      { ...WORKSHOP, currentProjectId: null },
      { meetingId: "meeting-a", projectId: null, projectCleared: true },
    );

    expect(result.refusals).toEqual([]);
  });

  it("still treats an unresolved link as no change", () => {
    // The distinction the whole rule turns on. Both arrive as `projectId:
    // null`; only one of them is an edit.
    const result = checkWorkshop(WORKSHOP, {
      meetingId: "meeting-a",
      projectId: null,
      projectCleared: false,
    });

    expect(result.refusals).toEqual([]);
  });
});

const titleParse = workshopsSpec.fields.title.parse;
const descriptionParse = workshopsSpec.fields.description.parse;

function workshopValueFacts(raw: { title?: string; description?: string }) {
  return {
    airtableRecordId: "recWorkshop",
    rawTitle: raw.title,
    title: titleParse(raw.title),
    rawDescription: raw.description,
    description: descriptionParse(raw.description),
  };
}

describe("workshop values", () => {
  it("stays silent on a workshop with neither written", () => {
    // Both are optional: a workshop authored before these columns existed
    // renders off its project's name and is not a fault.
    expect(checkWorkshopValues(workshopValueFacts({})).refusals).toEqual([]);
  });

  it("refuses a title longer than a schedule row", () => {
    const long = "x".repeat(WORKSHOP_TITLE_MAX_LENGTH + 1);
    const facts = workshopValueFacts({ title: long });

    const result = checkWorkshopValues(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "workshop_title_too_long",
    ]);
    // Load-bearing: the caller drops the key on this, and dropping is what
    // stops a one-character edit erasing the title that was published.
    expect(result.rejectedFields.has("title")).toBe(true);
    expect(facts.title).toBeNull();
  });

  it("refuses a description longer than the dialog", () => {
    const facts = workshopValueFacts({
      description: "x".repeat(WORKSHOP_DESCRIPTION_MAX_LENGTH + 1),
    });

    const result = checkWorkshopValues(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "workshop_description_too_long",
    ]);
    expect(result.rejectedFields.has("description")).toBe(true);
  });

  it("refuses each field independently", () => {
    const result = checkWorkshopValues(
      workshopValueFacts({
        title: "x".repeat(WORKSHOP_TITLE_MAX_LENGTH + 1),
        description: "y".repeat(WORKSHOP_DESCRIPTION_MAX_LENGTH + 1),
      }),
    );

    expect(result.refusals).toHaveLength(2);
    expect(result.rejectedFields).toEqual(new Set(["title", "description"]));
  });

  it("accepts both exactly at their limits", () => {
    const facts = workshopValueFacts({
      title: "x".repeat(WORKSHOP_TITLE_MAX_LENGTH),
      description: "y".repeat(WORKSHOP_DESCRIPTION_MAX_LENGTH),
    });

    expect(checkWorkshopValues(facts).refusals).toEqual([]);
    expect(facts.title).toHaveLength(WORKSHOP_TITLE_MAX_LENGTH);
  });
});

const maxTeamSizeParse = competitionsSpec.fields.maxTeamSize.parse;
const requirementCountParse = competitionsSpec.fields.requirementCount.parse;

function competitionValueFacts(raw: {
  maxTeamSize?: number;
  requirementCount?: number;
}) {
  return {
    airtableRecordId: "recCompetition",
    rawMaxTeamSize: raw.maxTeamSize,
    maxTeamSize: maxTeamSizeParse(raw.maxTeamSize),
    rawRequirementCount: raw.requirementCount,
    requirementCount: requirementCountParse(raw.requirementCount),
  };
}

describe("competition numbers", () => {
  it("stays silent when neither is set", () => {
    expect(checkCompetitionValues(competitionValueFacts({})).refusals).toEqual(
      [],
    );
  });

  it("refuses a max team size of zero", () => {
    // `competitions_maxTeamSize_positive`. Typing 0 is an ordinary slip and
    // used to be an exception raised in the middle of the pull.
    const facts = competitionValueFacts({ maxTeamSize: 0 });

    expect(checkCompetitionValues(facts).refusals.map((r) => r.code)).toEqual([
      "competition_max_team_size_invalid",
    ]);
    expect(facts.maxTeamSize).toBeNull();
  });

  it("refuses a negative requirement count", () => {
    const facts = competitionValueFacts({ requirementCount: -1 });

    expect(checkCompetitionValues(facts).refusals.map((r) => r.code)).toEqual([
      "competition_requirement_count_invalid",
    ]);
    expect(facts.requirementCount).toBeNull();
  });

  it("accepts a zero requirement count", () => {
    // Zero requirements is a real competition, unlike a zero-person team.
    // `competitions_requirementCount_nonneg` allows it, so this must too.
    const facts = competitionValueFacts({ requirementCount: 0 });

    expect(checkCompetitionValues(facts).refusals).toEqual([]);
    expect(facts.requirementCount).toBe(0);
  });

  it("refuses a fractional team size", () => {
    const facts = competitionValueFacts({ maxTeamSize: 2.5 });

    expect(checkCompetitionValues(facts).refusals.map((r) => r.code)).toEqual([
      "competition_max_team_size_invalid",
    ]);
  });
});
