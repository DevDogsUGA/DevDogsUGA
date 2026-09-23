import { describe, expect, it } from "vitest";
import type { ClubConfig, Meeting, Workshop } from "./schema";
import { validateClubConfig } from "./validator";

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    id: "supabase",
    title: "Supabase",
    description: null,
    project: null,
    ...overrides,
  };
}

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "cold-start",
    title: "Cold Start",
    summary: null,
    kind: null,
    building: "DLW",
    location: "124",
    startsAt: "2026-09-14T22:00:00.000Z",
    endsAt: "2026-09-14T23:30:00.000Z",
    rsvpUrl: null,
    cancelledAt: null,
    cancellationReason: null,
    countsForCredit: true,
    surveyUrl: null,
    agenda: [],
    ...overrides,
  };
}

function config(meetings: Meeting[]): ClubConfig {
  return { meetings };
}

describe("id uniqueness", () => {
  it("allows distinct ids across meetings and workshops", () => {
    const result = validateClubConfig(
      config([
        meeting({ id: "a", agenda: [workshop({ id: "a-1" })] }),
        meeting({ id: "b", agenda: [workshop({ id: "b-1" })] }),
      ]),
    );
    expect(result).toEqual([]);
  });

  it("refuses two meetings sharing an id", () => {
    const result = validateClubConfig(
      config([meeting({ id: "dup" }), meeting({ id: "dup" })]),
    );
    expect(result.map((i) => i.code)).toEqual(["duplicate_id"]);
  });

  it("refuses a workshop id colliding with a meeting id", () => {
    // Ambiguous, not merely confusing: the reconcile looks up a row by
    // configId with no table qualifier.
    const result = validateClubConfig(
      config([meeting({ id: "shared", agenda: [workshop({ id: "shared" })] })]),
    );
    expect(result.map((i) => i.code)).toEqual(["duplicate_id"]);
  });

  it("refuses a workshop id colliding across two different meetings", () => {
    const result = validateClubConfig(
      config([
        meeting({ id: "a", agenda: [workshop({ id: "dup" })] }),
        meeting({ id: "b", agenda: [workshop({ id: "dup" })] }),
      ]),
    );
    expect(result.map((i) => i.code)).toEqual(["duplicate_id"]);
  });
});

describe("cancellation pairing", () => {
  it("allows a cancelled meeting with a reason", () => {
    const result = validateClubConfig(
      config([
        meeting({
          cancelledAt: "2026-09-10T00:00:00.000Z",
          cancellationReason: "no sprint this week",
        }),
      ]),
    );
    expect(result).toEqual([]);
  });

  it("allows a cancelled meeting with no stated reason", () => {
    const result = validateClubConfig(
      config([meeting({ cancelledAt: "2026-09-10T00:00:00.000Z" })]),
    );
    expect(result).toEqual([]);
  });

  it("refuses a reason with no cancellation date", () => {
    const result = validateClubConfig(
      config([meeting({ cancellationReason: "no sprint this week" })]),
    );
    expect(result.map((i) => i.code)).toEqual([
      "meeting_cancellation_reason_without_date",
    ]);
  });
});

describe("RSVP host allowlist", () => {
  it("allows the club's own host", () => {
    const result = validateClubConfig(
      config([
        meeting({ rsvpUrl: "https://uga.campuslabs.com/engage/event/1" }),
      ]),
    );
    expect(result).toEqual([]);
  });

  it("refuses an off-allowlist host", () => {
    const result = validateClubConfig(
      config([meeting({ rsvpUrl: "https://evil.example.com/x" })]),
    );
    expect(result.map((i) => i.code)).toEqual(["meeting_rsvp_host"]);
  });

  it("allows a meeting with no RSVP link", () => {
    const result = validateClubConfig(config([meeting({ rsvpUrl: null })]));
    expect(result).toEqual([]);
  });
});

describe("empty config", () => {
  it("has no issues of its own -- the reconcile's guard is separate", () => {
    expect(validateClubConfig(config([]))).toEqual([]);
  });
});
