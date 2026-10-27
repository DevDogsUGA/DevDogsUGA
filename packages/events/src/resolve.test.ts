import { describe, expect, it } from "vitest";
import meetingsFile from "./data/meetings.json" with { type: "json" };
import seriesFile from "./data/series.json" with { type: "json" };
import { getClubConfig, parseConfigFiles } from "./index";
import { deriveTitle, resolveMeetings, seriesNumbers, termOf } from "./resolve";
import { clubConfigSchema, type AuthoredMeeting } from "./schema";
import { seriesConfigSchema, type Series } from "./series";
import { validateAuthored } from "./validator";

const build: Series = {
  id: "build-session",
  name: "Build Session",
  category: "build",
  brand: "devdogs",
  headline: "series",
  numbered: true,
  summary: "Work on your project.",
  building: "DLW",
  location: "124",
};
const merge: Series = {
  id: "merge-monday",
  name: "Merge Monday",
  category: "build",
  brand: "devdogs",
  headline: "series",
  summary: "Merge it.",
  location: "124",
};
const wednesday: Series = {
  id: "workshop-wednesday",
  name: "Workshop Wednesday",
  category: "workshop",
  brand: "devdogs",
  headline: "topic",
  summary: "Learn it.",
  location: "124",
};

function meeting(overrides: Partial<AuthoredMeeting> = {}): AuthoredMeeting {
  return {
    slug: "2026-09-16",
    startsAt: "2026-09-16T22:00:00.000Z",
    endsAt: "2026-09-16T23:00:00.000Z",
    rsvpUrl: null,
    cancelledAt: null,
    cancellationReason: null,
    countsForCredit: false,
    surveyUrl: null,
    agenda: [],
    ...overrides,
  };
}

const workshop = (title: string) => ({
  title,
  description: null,
  project: null,
});

describe("termOf", () => {
  it("reads the semester off the club's clock", () => {
    expect(termOf("2026-09-16T22:00:00.000Z")).toBe("2026-fall");
    expect(termOf("2027-01-20T23:00:00.000Z")).toBe("2027-spring");
    expect(termOf("2027-06-20T23:00:00.000Z")).toBe("2027-summer");
    // 8 PM on Dec 31 Eastern is already Jan 1 UTC.
    expect(termOf("2027-01-01T01:00:00.000Z")).toBe("2026-fall");
  });
});

describe("numbering", () => {
  const meetings = [
    meeting({ slug: "2026-09-16", series: "build-session" }),
    meeting({
      slug: "2026-09-23",
      series: "build-session",
      startsAt: "2026-09-23T22:00:00.000Z",
      endsAt: "2026-09-23T23:00:00.000Z",
      cancelledAt: "2026-09-22T12:00:00.000Z",
    }),
    meeting({
      slug: "2026-09-30",
      series: "build-session",
      startsAt: "2026-09-30T22:00:00.000Z",
      endsAt: "2026-09-30T23:00:00.000Z",
    }),
    meeting({
      slug: "2027-01-20",
      series: "build-session",
      startsAt: "2027-01-20T23:00:00.000Z",
      endsAt: "2027-01-21T00:00:00.000Z",
    }),
  ];

  it("counts per term in date order, skipping cancelled nights", () => {
    const numbers = seriesNumbers(meetings, [build]);
    expect(numbers.get("2026-09-16")).toBe(1);
    expect(numbers.has("2026-09-23")).toBe(false);
    expect(numbers.get("2026-09-30")).toBe(2);
    expect(numbers.get("2027-01-20")).toBe(1);
  });

  it("numbers by date, not by the order they were authored", () => {
    const numbers = seriesNumbers([...meetings].reverse(), [build]);
    expect(numbers.get("2026-09-16")).toBe(1);
    expect(numbers.get("2026-09-30")).toBe(2);
  });

  it("leaves an unnumbered series alone", () => {
    const numbers = seriesNumbers(
      [meeting({ series: "merge-monday" })],
      [merge],
    );
    expect(numbers.size).toBe(0);
  });
});

describe("deriveTitle", () => {
  it("shows the series name, with #n", () => {
    expect(deriveTitle(meeting(), build, 3).title).toBe("Build Session #3");
  });

  it("drops #n for a cancelled night (no number)", () => {
    expect(deriveTitle(meeting(), build, undefined).title).toBe(
      "Build Session",
    );
  });

  it("adds the night's workshops after a colon", () => {
    const agenda = [workshop("Next.js II"), workshop("Flutter II")];
    expect(deriveTitle(meeting({ agenda }), merge, undefined).title).toBe(
      "Merge Monday: Next.js II & Flutter II",
    );
    expect(
      deriveTitle(meeting({ agenda: [workshop("Supabase")] }), merge, undefined)
        .title,
    ).toBe("Merge Monday: Supabase");
  });

  it("falls back to 'Workshops' past two workshops", () => {
    const agenda = [workshop("A"), workshop("B"), workshop("C")];
    expect(deriveTitle(meeting({ agenda }), merge, undefined).title).toBe(
      "Merge Monday: Workshops",
    );
  });

  it("lets an authored title win", () => {
    expect(
      deriveTitle(meeting({ title: "Merge Monday: Special" }), merge, undefined)
        .title,
    ).toBe("Merge Monday: Special");
  });

  it("leads a topic series with the workshop topic, the series as kicker", () => {
    expect(
      deriveTitle(
        meeting({ agenda: [workshop("Supabase II")] }),
        wednesday,
        undefined,
      ),
    ).toEqual({ title: "Supabase II", kicker: "Workshop Wednesday" });
  });

  it("names a topic night by its series until a workshop is announced", () => {
    expect(deriveTitle(meeting(), wednesday, undefined)).toEqual({
      title: "Workshop Wednesday",
      kicker: null,
    });
  });
});

describe("resolveMeetings", () => {
  const authored = clubConfigSchema.parse({
    meetings: [
      meeting({ series: "build-session" }),
      meeting({
        slug: "2026-10-01",
        title: "Kickoff",
        summary: "Go.",
        category: "milestone",
        brand: "gdgc",
        location: "TBA",
        building: null,
      }),
    ],
  });

  it("inherits from the series and lets the meeting override", () => {
    const [night, oneOff] = resolveMeetings(authored, [build]).meetings;
    expect(night).toMatchObject({
      title: "Build Session #1",
      series: "build-session",
      category: "build",
      brand: "devdogs",
      building: "DLW",
      location: "124",
      summary: "Work on your project.",
    });
    expect(oneOff).toMatchObject({
      title: "Kickoff",
      series: null,
      category: "milestone",
      brand: "gdgc",
      building: null,
    });
  });

  it("keeps an explicitly null building over the series'", () => {
    const cfg = clubConfigSchema.parse({
      meetings: [meeting({ series: "build-session", building: null })],
    });
    expect(resolveMeetings(cfg, [build]).meetings[0]!.building).toBeNull();
  });
});

describe("validateAuthored", () => {
  const codes = (meetings: AuthoredMeeting[], series: Series[]) =>
    validateAuthored({ meetings }, { series }).map((i) => i.code);

  it("flags an unknown series", () => {
    expect(codes([meeting({ series: "nope" })], [build])).toEqual([
      "unknown_series",
    ]);
  });

  it("flags a one-off with no title or category", () => {
    expect(codes([meeting({ summary: "x", location: "y" })], [])).toEqual([
      "missing_title",
      "missing_category",
    ]);
  });

  it("flags duplicate series ids", () => {
    expect(codes([], [build, build])).toEqual(["duplicate_series_id"]);
  });
});

describe("the committed files", () => {
  it("series.json parses", () => {
    expect(seriesConfigSchema.safeParse(seriesFile).success).toBe(true);
  });

  it("resolves: every meeting has a title, category and brand", () => {
    const { meetings } = getClubConfig();
    expect(meetings.length).toBe(meetingsFile.meetings.length);
    for (const m of meetings) {
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.category).toBeDefined();
      expect(m.brand).toBeDefined();
    }
  });

  it("keeps the titles the club already used", () => {
    const titles = new Map(
      getClubConfig().meetings.map((m) => [m.slug, m.title]),
    );
    expect(titles.get("2026-09-16")).toBe("Build Session #1");
    expect(titles.get("2026-10-14")).toBe("Build Session #5");
    expect(titles.get("2026-10-07")).toBe("DevDogs Touch Grass #1");
    expect(titles.get("2026-11-18")).toBe("DevDogs Touch Grass #2");
    expect(titles.get("2026-11-02")).toBe("Merge Monday");
    expect(titles.get("2026-10-12")).toBe(
      "Merge Monday: Next.js II & Flutter II",
    );
  });

  it("refuses a meeting naming a series that does not exist", () => {
    expect(() =>
      parseConfigFiles(
        { meetings: [meeting({ series: "ghost" })] },
        { questions: [] },
        { series: [] },
      ),
    ).toThrow(/ghost/);
  });
});
