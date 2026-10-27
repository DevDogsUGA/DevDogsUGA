import { describe, expect, it } from "vitest";
import type { ClubConfig, Meeting, Workshop } from "./schema";
import { validateClubConfig } from "./validator";

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    title: "Supabase",
    description: null,
    project: null,
    ...overrides,
  };
}

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    slug: "2026-09-14",
    title: "Cold Start",
    summary: "The first meeting of the year.",
    series: null,
    kicker: null,
    category: "milestone",
    brand: "devdogs",
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

describe("workshop titles", () => {
  it("allows one title in two meetings", () => {
    const result = validateClubConfig(
      config([
        meeting({ slug: "2026-09-14-a", agenda: [workshop()] }),
        meeting({ slug: "2026-09-14-b", agenda: [workshop()] }),
      ]),
    );
    expect(result).toEqual([]);
  });

  it("refuses one title twice in a meeting, whatever its case", () => {
    const result = validateClubConfig(
      config([
        meeting({
          agenda: [workshop(), workshop({ title: "supabase" })],
        }),
      ]),
    );
    expect(result.map((i) => [i.code, i.id])).toEqual([
      ["duplicate_workshop_title", "2026-09-14 › supabase"],
    ]);
  });
});

describe("slugs", () => {
  it("refuses two meetings sharing a slug", () => {
    const result = validateClubConfig(
      config([meeting({ title: "A" }), meeting({ title: "B" })]),
    );
    expect(result.map((i) => i.code)).toEqual(["duplicate_slug"]);
  });

  it("refuses a slug dated other than the meeting's Eastern day", () => {
    // 22:00Z on the 14th is 6 PM Eastern on the 14th; 02:00Z on the 15th is
    // still the evening of the 14th in Athens.
    const late = meeting({
      slug: "2026-09-15",
      startsAt: "2026-09-15T02:00:00.000Z",
      endsAt: "2026-09-15T03:00:00.000Z",
    });
    expect(validateClubConfig(config([late])).map((i) => i.code)).toEqual([
      "meeting_slug_date",
    ]);
    expect(
      validateClubConfig(config([{ ...late, slug: "2026-09-14" }])),
    ).toEqual([]);
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

describe("RSVP HTTPS URL guards", () => {
  it("allows the club's own host", () => {
    const result = validateClubConfig(
      config([
        meeting({ rsvpUrl: "https://uga.campuslabs.com/engage/event/1" }),
      ]),
    );
    expect(result).toEqual([]);
  });

  it("allows Bevy event URLs", () => {
    const result = validateClubConfig(
      config([
        meeting({
          rsvpUrl: "https://gdg.community.dev/events/details/georgia-311/",
        }),
      ]),
    );
    expect(result).toEqual([]);
  });

  // `new URL(url).hostname` parses both of these as the allowed host --
  // that is exactly the trap the DB's `meetings_rsvpUrl_host` check
  // constraint's comment warns about. A validator that fell into it would
  // pass a URL through CI that Postgres then rejects mid-reconcile.
  it("refuses the allowed host over http", () => {
    const result = validateClubConfig(
      config([
        meeting({ rsvpUrl: "http://uga.campuslabs.com/engage/event/1" }),
      ]),
    );
    expect(result.map((i) => i.code)).toEqual(["meeting_rsvp_host"]);
  });

  it("refuses the allowed host with userinfo smuggled in", () => {
    const result = validateClubConfig(
      config([meeting({ rsvpUrl: "https://attacker@uga.campuslabs.com/x" })]),
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
