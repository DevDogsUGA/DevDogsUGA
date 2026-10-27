import { describe, expect, it } from "vitest";
import meetingsFile from "./data/meetings.json" with { type: "json" };
import seriesFile from "./data/series.json" with { type: "json" };
import {
  getClubConfig,
  getVenues,
  getWorkshops,
  parseConfigFiles,
} from "./index";
import {
  deriveTitle,
  resolveMeetings,
  resolveVenue,
  seriesNumbers,
  termOf,
  type ResolveCatalog,
} from "./resolve";
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
  venue: "dlw",
  room: "124",
};
const merge: Series = {
  id: "merge-monday",
  name: "Merge Monday",
  category: "build",
  brand: "devdogs",
  headline: "series",
  summary: "Merge it.",
  venue: "dlw",
  room: "124",
};
const wednesday: Series = {
  id: "workshop-wednesday",
  name: "Workshop Wednesday",
  category: "workshop",
  brand: "devdogs",
  headline: "topic",
  summary: "Learn it.",
  venue: "dlw",
  room: "124",
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

const catalog: ResolveCatalog = {
  workshops: [
    "Next.js II",
    "Flutter II",
    "Supabase",
    "Supabase II",
    "A",
    "B",
    "C",
  ].map((title) => ({
    id: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, ""),
    title,
    description: `About ${title}.`,
    project: null,
    elHours: 1,
  })),
  venues: [
    {
      id: "dlw",
      kind: "campus",
      name: "DLW Center",
      shortName: "DLW",
      building: "DLW",
    },
    {
      id: "dawson-hall",
      kind: "campus",
      name: "Dawson Hall",
      shortName: "Dawson",
    },
    { id: "tba", kind: "tba", name: "TBA" },
  ],
};

/** Titles for `deriveTitle`, which only reads them. */
const titles = (...names: string[]) => names.map((title) => ({ title }));

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
    expect(deriveTitle(meeting(), [], build, 3).title).toBe("Build Session #3");
  });

  it("drops #n for a cancelled night (no number)", () => {
    expect(deriveTitle(meeting(), [], build, undefined).title).toBe(
      "Build Session",
    );
  });

  it("adds the night's workshops after a colon", () => {
    expect(
      deriveTitle(
        meeting(),
        titles("Next.js II", "Flutter II"),
        merge,
        undefined,
      ).title,
    ).toBe("Merge Monday: Next.js II & Flutter II");
    expect(
      deriveTitle(meeting(), titles("Supabase"), merge, undefined).title,
    ).toBe("Merge Monday: Supabase");
  });

  it("falls back to 'Workshops' past two workshops", () => {
    expect(
      deriveTitle(meeting(), titles("A", "B", "C"), merge, undefined).title,
    ).toBe("Merge Monday: Workshops");
  });

  it("lets an authored title win", () => {
    expect(
      deriveTitle(
        meeting({ title: "Merge Monday: Special" }),
        [],
        merge,
        undefined,
      ).title,
    ).toBe("Merge Monday: Special");
  });

  it("leads a topic series with the workshop topic, the series as kicker", () => {
    expect(
      deriveTitle(meeting(), titles("Supabase II"), wednesday, undefined),
    ).toEqual({ title: "Supabase II", kicker: "Workshop Wednesday" });
  });

  it("names a topic night by its series until a workshop is announced", () => {
    expect(deriveTitle(meeting(), [], wednesday, undefined)).toEqual({
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
        venue: "tba",
      }),
    ],
  });

  it("inherits from the series and lets the meeting override", () => {
    const [night, oneOff] = resolveMeetings(
      authored,
      [build],
      catalog,
    ).meetings;
    expect(night).toMatchObject({
      title: "Build Session #1",
      series: "build-session",
      category: "build",
      brand: "devdogs",
      building: "DLW",
      location: "124",
      summary: "Work on your project.",
    });
    expect(night!.venue).toMatchObject({ id: "dlw", room: "124" });
    expect(oneOff).toMatchObject({
      title: "Kickoff",
      series: null,
      category: "milestone",
      brand: "gdgc",
      building: null,
      location: "TBA",
    });
  });

  it("resolves a night's workshops from their definitions", () => {
    const cfg = clubConfigSchema.parse({
      meetings: [
        meeting({
          series: "workshop-wednesday",
          agenda: [
            "supabase-ii",
            { workshop: "flutter-ii", description: "Tonight: forms." },
          ],
        }),
      ],
    });
    const [night] = resolveMeetings(cfg, [wednesday], catalog).meetings;
    expect(
      night!.agenda.map((w) => [w.id, w.title, w.description, w.elHours]),
    ).toEqual([
      ["supabase-ii", "Supabase II", "About Supabase II.", 1],
      ["flutter-ii", "Flutter II", "Tonight: forms.", 1],
    ]);
    expect(night!.title).toBe("Supabase II & Flutter II");
  });

  it("refuses an unknown workshop rather than dropping it", () => {
    const cfg = clubConfigSchema.parse({
      meetings: [meeting({ series: "build-session", agenda: ["ghost"] })],
    });
    expect(() => resolveMeetings(cfg, [build], catalog)).toThrow(/ghost/);
  });
});

describe("resolveVenue", () => {
  const venues = new Map(catalog.venues.map((v) => [v.id, v]));
  const one = (m: Partial<AuthoredMeeting>, series?: Series) =>
    resolveVenue({ slug: "2026-09-16", ...m }, series, venues);

  it("takes the series' venue and room by default", () => {
    expect(one({}, build)).toMatchObject({ id: "dlw", room: "124" });
  });

  it("lets the meeting's room override the series'", () => {
    expect(one({ room: "110" }, build)).toMatchObject({
      id: "dlw",
      room: "110",
    });
  });

  it("does not carry the series' room into another venue", () => {
    expect(one({ venue: "dawson-hall" }, build)).toMatchObject({
      id: "dawson-hall",
      room: null,
    });
  });

  it("never falls back to a default: no venue, or an unknown one, throws", () => {
    expect(() => one({})).toThrow(/no venue/);
    expect(() => one({ venue: "dlw-124" })).toThrow(/dlw-124/);
  });
});

describe("validateAuthored", () => {
  const codes = (meetings: AuthoredMeeting[], series: Series[]) =>
    validateAuthored(
      { meetings },
      { series },
      { workshops: catalog.workshops as never },
      { venues: catalog.venues as never },
    ).map((i) => i.code);

  it("flags an unknown series", () => {
    expect(codes([meeting({ series: "nope" })], [build])).toEqual([
      "unknown_series",
    ]);
  });

  it("flags a one-off with no title, category or venue", () => {
    expect(codes([meeting({ summary: "x" })], [])).toEqual([
      "missing_title",
      "missing_category",
      "missing_venue",
    ]);
  });

  it("flags duplicate series ids", () => {
    expect(codes([], [build, build])).toEqual(["duplicate_series_id"]);
  });

  it("flags an unknown venue or workshop, and a workshop twice in a night", () => {
    expect(
      codes(
        [
          meeting({
            series: "build-session",
            venue: "dlw-124",
            agenda: ["ghost", "supabase", "supabase"],
          }),
        ],
        [build],
      ),
    ).toEqual([
      "unknown_venue",
      "unknown_workshop",
      "duplicate_workshop_in_meeting",
    ]);
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

  it("keeps every place the pages already printed", () => {
    const place = new Map(
      getClubConfig().meetings.map((m) => [m.slug, [m.building, m.location]]),
    );
    expect(place.get("2026-09-14")).toEqual(["DLW", "124"]);
    expect(place.get("2026-10-05-workshop")).toEqual(["DLW", "110"]);
    expect(place.get("2026-10-07")).toEqual(["Other", "Myers Quad"]);
    expect(place.get("2026-10-08-georgia-311")).toEqual([
      "Other",
      "Dawson 110",
    ]);
    expect(place.get("2026-10-11-georgia-311")).toEqual([
      "Other",
      "Virtual — Bevy (recorded)",
    ]);
    expect(place.get("2026-10-14-georgia-311")).toEqual(["DLW", "124"]);
    expect(place.get("2026-10-30")).toEqual([
      null,
      "Morehouse College, Atlanta",
    ]);
    expect(place.get("2026-11-18")).toEqual([null, "TBA"]);
  });

  it("resolves workshops from definitions with their old words", () => {
    const night = getClubConfig().meetings.find(
      (m) => m.slug === "2026-09-21",
    )!;
    expect(
      night.agenda.map((w) => [w.id, w.title, w.project, w.elHours]),
    ).toEqual([
      ["nextjs", "Next.js", "DogDays", 1],
      ["flutter", "Flutter", "DogPack", 1],
    ]);
  });

  it("leaves every venue unverified: nothing has been walked yet", () => {
    for (const venue of getVenues().venues) {
      expect(venue.verified).toBeUndefined();
    }
    expect(getWorkshops().workshops.length).toBeGreaterThan(0);
  });

  it("refuses a meeting naming a venue that does not exist", () => {
    expect(() =>
      parseConfigFiles(
        { meetings: [meeting({ series: "build-session", venue: "dlw-124" })] },
        { questions: [] },
        { series: [build] },
        { workshops: [] },
        { venues: catalog.venues },
      ),
    ).toThrow(/dlw-124/);
  });
});
