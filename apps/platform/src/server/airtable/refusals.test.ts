import { describe, expect, it } from "vitest";
import {
  checkCompetition,
  checkCompetitionValues,
  type CompetitionFacts,
} from "./refusals";
import {
  COMPETITION_TITLE_MAX_LENGTH,
  competitions as competitionsSpec,
} from "@devdogsuga/airtable";

/**
 * One test per refusal rule, because these rules protect arithmetic that has
 * already been published.
 *
 * Meetings, workshops and projects lost their refusal rules with the
 * config-as-code cutover -- they are validated by `@devdogsuga/club-config`'s
 * CI check now, before anything reaches this file, so `checkMeeting`,
 * `checkProject` and `checkWorkshop*` and their tests are gone rather than
 * dead-coded here. Competitions stay Airtable-authored until the git-native
 * competitions rework (P3), so their rules and tests remain.
 */

const competitionTitleParse = competitionsSpec.fields.title.parse;

function competitionValueFacts(raw: { title?: string }) {
  return {
    airtableRecordId: "recCompetition",
    rawTitle: raw.title,
    title: competitionTitleParse(raw.title),
  };
}

describe("competition title", () => {
  it("stays silent when it is not set", () => {
    expect(checkCompetitionValues(competitionValueFacts({})).refusals).toEqual(
      [],
    );
  });

  it("refuses a title longer than a heading and keeps the published one", () => {
    // Over the cap the parser returns null, and the rule flags `title` so the
    // caller deletes the key rather than blanking a heading mid-edit -- the
    // same protection the workshop title has.
    const long = "x".repeat(COMPETITION_TITLE_MAX_LENGTH + 1);
    const facts = competitionValueFacts({ title: long });
    const result = checkCompetitionValues(facts);

    expect(result.refusals.map((r) => r.code)).toEqual([
      "competition_title_too_long",
    ]);
    expect(result.rejectedFields.has("title")).toBe(true);
    expect(facts.title).toBeNull();
  });

  it("accepts a title exactly at the limit", () => {
    const facts = competitionValueFacts({
      title: "x".repeat(COMPETITION_TITLE_MAX_LENGTH),
    });

    expect(checkCompetitionValues(facts).refusals).toEqual([]);
    expect(facts.title).toHaveLength(COMPETITION_TITLE_MAX_LENGTH);
  });
});

const COMPETITION: CompetitionFacts = {
  airtableRecordId: "recCompetition",
  participationFrozen: false,
  currentJudgingStartsAt: new Date("2026-04-10T18:00:00Z"),
  workshopMeetingStartsAt: new Date("2026-04-03T18:00:00Z"),
};

describe("judgingStartsAt", () => {
  it("refuses a move after participation freezes", () => {
    const result = checkCompetition(
      { ...COMPETITION, participationFrozen: true },
      { judgingStartsAt: new Date("2026-04-17T18:00:00Z") },
    );

    expect(result.refusals.map((r) => r.code)).toEqual([
      "judging_moved_after_freeze",
    ]);
  });

  it("refuses a time at or before the opening workshop's meeting", () => {
    const result = checkCompetition(COMPETITION, {
      judgingStartsAt: new Date("2026-04-01T18:00:00Z"),
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "judging_before_workshop",
    ]);
  });

  it("refuses a time exactly at the meeting start", () => {
    const result = checkCompetition(COMPETITION, {
      judgingStartsAt: new Date("2026-04-03T18:00:00Z"),
    });

    expect(result.refusals.map((r) => r.code)).toEqual([
      "judging_before_workshop",
    ]);
  });

  it("allows rescheduling before the freeze", () => {
    const result = checkCompetition(COMPETITION, {
      judgingStartsAt: new Date("2026-04-17T18:00:00Z"),
    });

    expect(result.refusals).toEqual([]);
  });

  it("allows the unchanged value after the freeze", () => {
    const result = checkCompetition(
      { ...COMPETITION, participationFrozen: true },
      { judgingStartsAt: new Date("2026-04-10T18:00:00Z") },
    );

    expect(result.refusals).toEqual([]);
  });

  it("allows a first schedule on a competition that had none", () => {
    // A null judgingStartsAt means "not scheduled yet", never "never", so
    // filling it in is not a move.
    const result = checkCompetition(
      { ...COMPETITION, currentJudgingStartsAt: null },
      { judgingStartsAt: new Date("2026-04-10T18:00:00Z") },
    );

    expect(result.refusals).toEqual([]);
  });

  it("does not refuse a competition whose workshop meeting is unknown", () => {
    const result = checkCompetition(
      { ...COMPETITION, workshopMeetingStartsAt: null },
      { judgingStartsAt: new Date("2026-01-01T18:00:00Z") },
    );

    expect(result.refusals).toEqual([]);
  });
});
