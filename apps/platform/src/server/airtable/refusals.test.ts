import { describe, expect, it } from "vitest";
import {
  describeIncompleteMeeting,
  checkCompetition,
  checkMeeting,
  checkWorkshop,
  type CompetitionFacts,
  type MeetingFacts,
  type WorkshopFacts,
} from "./refusals";
import {
  MEETING_SUMMARY_MAX_LENGTH,
  meetings as meetingsSpec,
  parseRsvpUrl,
} from "@devdogsuga/airtable";

/**
 * One test per refusal rule, because these are the rules that protect credit
 * people have already earned and arithmetic that has already been published.
 *
 * Each rule gets three cases and the third is the one that matters: the edit
 * is refused when it would destroy something, allowed when it would not, and
 * — the case that is easy to get wrong — allowed when the officer is simply
 * mid-edit and the field has not arrived yet.
 */

/**
 * `checkMeeting` is the other class of rule — see the note at the top of
 * `refusals.ts`. Nothing here protects credit already earned; these say only
 * that a value cannot go on a public page as written.
 *
 * Which makes the empty case the one that matters most. A blank Summary and a
 * blank RSVP are the ORDINARY state of a meeting, so a rule that complained
 * about them would put a permanent refusal on every row in the base and
 * destroy `⚙️ Sync status` as a signal.
 *
 * The facts are built through the real parser rather than by hand, because
 * "present but the parser refused it" is the entire distinction under test and
 * asserting it against a hand-written null would assert nothing.
 */
const summaryParse = meetingsSpec.fields.summary.parse;
const rsvpParse = meetingsSpec.fields.rsvpUrl.parse;

function meetingFacts(raw: {
  summary?: string;
  rsvpUrl?: string;
}): MeetingFacts {
  return {
    airtableRecordId: "recMeeting",
    // Airtable omits an empty field from `fields` entirely rather than
    // returning null, so `undefined` is what absence actually looks like.
    rawSummary: raw.summary,
    summary: summaryParse(raw.summary),
    rawRsvpUrl: raw.rsvpUrl,
    rsvpUrl: rsvpParse(raw.rsvpUrl),
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
    // officer's text verbatim would therefore let a value through the parser
    // that the insert rejects — and a constraint violation inside the pull
    // fails the whole sync pass, for every table, rather than one field.
    const facts = meetingFacts({
      rsvpUrl: "https://UGA.CampusLabs.com/engage/event/12345678",
    });

    expect(checkMeeting(facts).refusals).toEqual([]);
    expect(facts.rsvpUrl).toBe(RSVP);
  });

  it("refuses a credentialled URL on an allowlisted host", () => {
    // `new URL()` parses this happily and reports the allowlisted hostname, so
    // a host check alone would let it through — and it would then fail the
    // `meetings_rsvpUrl_host` constraint at insert and take the pass down.
    const result = checkMeeting(
      meetingFacts({ rsvpUrl: "https://someone@uga.campuslabs.com/engage" }),
    );

    expect(result.refusals.map((r) => r.code)).toEqual(["meeting_rsvp_host"]);
  });

  it("refuses malformed garbage without throwing", () => {
    // `new URL()` throws on every one of these. `applyPull` runs the parser
    // inside a bare `.map()`, so an exception here would not skip one row — it
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

describe("describeIncompleteMeeting", () => {
  /**
   * A row below the completeness bar used to be skipped in total silence, so
   * a half-filled meeting and one the sync had never reached looked identical
   * in the grid: clean status, nothing on the site, no way to tell which.
   *
   * These assertions are mostly about WORDING, which is unusual for a test and
   * deliberate here. The reason the row was silent is a good one — officers
   * fill fields one at a time and a pass landing between two keystrokes must
   * not complain — and the only thing separating "a state" from "a complaint"
   * is how it reads.
   */
  const missingEnd = {
    name: "Sprint 2",
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
      { name: null, startsAt: null, endsAt: null },
      false,
    );
    expect(message).toContain("a name, a start time and an end time");
  });

  it("describes a bad ORDER rather than claiming something is absent", () => {
    // Every field arrived; the end is not after the start. Saying "still needs
    // an end time" here would send an officer to a field that is filled in.
    const message = describeIncompleteMeeting(
      {
        name: "Sprint 2",
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
