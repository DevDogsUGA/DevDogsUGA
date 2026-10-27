import { describe, expect, it } from "vitest";
import { clubConfigSchema, meetingSchema } from "./schema";
import { workshopDefinitionSchema } from "./workshops";
import { venueSchema, venuesConfigSchema } from "./venues";

function workshop(overrides: Record<string, unknown> = {}) {
  return {
    id: "supabase",
    title: "Supabase",
    description: null,
    project: null,
    ...overrides,
  };
}

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    slug: "2026-09-14",
    title: "Cold Start",
    summary: "The first meeting of the year.",
    category: "milestone",
    venue: "dlw",
    room: "124",
    startsAt: "2026-09-14T22:00:00.000Z",
    endsAt: "2026-09-14T23:30:00.000Z",
    rsvpUrl: null,
    cancelledAt: null,
    cancellationReason: null,
    surveyUrl: null,
    agenda: [],
    ...overrides,
  };
}

describe("workshopDefinitionSchema", () => {
  it("accepts a minimal workshop, one EL hour by default", () => {
    expect(workshopDefinitionSchema.parse(workshop())).toMatchObject({
      id: "supabase",
      title: "Supabase",
      elHours: 1,
    });
  });

  it("accepts a free-text project recommendation and topics", () => {
    const parsed = workshopDefinitionSchema.parse(
      workshop({ project: "DogDays & DogPack", topics: ["databases"] }),
    );
    expect(parsed.project).toBe("DogDays & DogPack");
    expect(parsed.topics).toEqual(["databases"]);
  });

  it("carries its own EL allowance", () => {
    expect(
      workshopDefinitionSchema.parse(workshop({ elHours: 2 })).elHours,
    ).toBe(2);
    expect(() =>
      workshopDefinitionSchema.parse(workshop({ elHours: 0 })),
    ).toThrow();
    expect(() =>
      workshopDefinitionSchema.parse(workshop({ elHours: 9 })),
    ).toThrow();
  });

  it("needs a kebab id and a title", () => {
    expect(() =>
      workshopDefinitionSchema.parse(workshop({ id: "Next JS" })),
    ).toThrow();
    expect(() =>
      workshopDefinitionSchema.parse(workshop({ title: "" })),
    ).toThrow();
  });
});

describe("venueSchema", () => {
  const venue = (overrides: Record<string, unknown> = {}) => ({
    id: "dawson-hall",
    kind: "campus",
    name: "Dawson Hall",
    ...overrides,
  });

  it("accepts a campus venue with no building code", () => {
    expect(venueSchema.parse(venue()).kind).toBe("campus");
  });

  it("accepts the map's buildings only", () => {
    expect(venueSchema.parse(venue({ building: "DLW" })).building).toBe("DLW");
    expect(() => venueSchema.parse(venue({ building: "Other" }))).toThrow();
  });

  it("rejects a kind outside the closed list", () => {
    expect(() => venueSchema.parse(venue({ kind: "moon" }))).toThrow();
  });

  it("takes verified details only with the day they were verified", () => {
    expect(
      venueSchema.parse(
        venue({
          verified: { verifiedOn: "2026-10-30", entrance: "North door" },
        }),
      ).verified?.entrance,
    ).toBe("North door");
    expect(() =>
      venueSchema.parse(venue({ verified: { entrance: "North door" } })),
    ).toThrow();
  });

  it("parses a catalog", () => {
    expect(venuesConfigSchema.parse({ venues: [venue()] }).venues).toHaveLength(
      1,
    );
  });
});

describe("meetingSchema", () => {
  it("accepts a minimal meeting", () => {
    expect(meetingSchema.parse(meeting())).toMatchObject({
      slug: "2026-09-14",
    });
  });

  it("rejects an id: the slug is a meeting's identity", () => {
    expect(() => meetingSchema.parse(meeting({ id: "cold-start" }))).toThrow();
  });

  it.each(["title", "summary", "room"])(
    "refuses a null or empty %s, which every newsletter card draws",
    (field) => {
      expect(() => meetingSchema.parse(meeting({ [field]: null }))).toThrow();
      expect(() => meetingSchema.parse(meeting({ [field]: "" }))).toThrow();
    },
  );

  it("accepts a date slug with a descriptor", () => {
    expect(
      meetingSchema.parse(meeting({ slug: "2026-09-14-cold-start" })).slug,
    ).toBe("2026-09-14-cold-start");
  });

  it("rejects a slug that does not lead with a date", () => {
    expect(() =>
      meetingSchema.parse(meeting({ slug: "cold-start" })),
    ).toThrow();
    expect(() =>
      meetingSchema.parse(meeting({ slug: "2026-09-14-Judging" })),
    ).toThrow();
  });

  it("rejects endsAt at or before startsAt", () => {
    expect(() =>
      meetingSchema.parse(
        meeting({
          startsAt: "2026-09-14T22:00:00.000Z",
          endsAt: "2026-09-14T22:00:00.000Z",
        }),
      ),
    ).toThrow();
  });

  it("rejects a category outside the closed list", () => {
    expect(() =>
      meetingSchema.parse(meeting({ category: "Karaoke Night" })),
    ).toThrow();
    // `kind` is gone: it became `category`.
    expect(() => meetingSchema.parse(meeting({ kind: "Social" }))).toThrow();
  });

  it("rejects a brand outside the closed list", () => {
    expect(() => meetingSchema.parse(meeting({ brand: "acme" }))).toThrow();
  });

  it("lets a series supply the title, summary, category and place", () => {
    const parsed = meetingSchema.parse({
      ...meeting(),
      series: "merge-monday",
      title: undefined,
      summary: undefined,
      category: undefined,
      venue: undefined,
      room: undefined,
    });
    expect(parsed.series).toBe("merge-monday");
  });

  it("rejects a legacy building or location: a place is a venue and a room", () => {
    expect(() => meetingSchema.parse(meeting({ building: "DLW" }))).toThrow();
    expect(() => meetingSchema.parse(meeting({ location: "124" }))).toThrow();
  });

  it("carries an agenda of workshop ids, with an optional night description", () => {
    const parsed = meetingSchema.parse(
      meeting({
        agenda: ["supabase", { workshop: "flutter", description: "Tonight." }],
      }),
    );
    expect(parsed.agenda).toHaveLength(2);
  });

  it("rejects an inline workshop in the agenda", () => {
    expect(() =>
      meetingSchema.parse(meeting({ agenda: [workshop()] })),
    ).toThrow();
  });
});

describe("clubConfigSchema", () => {
  it("accepts a config with one meeting", () => {
    const parsed = clubConfigSchema.parse({ meetings: [meeting()] });
    expect(parsed.meetings).toHaveLength(1);
  });

  it("accepts an empty meetings array structurally", () => {
    // The "config with zero meetings" guard belongs to the reconcile, not
    // the schema -- an empty array is a structurally valid config even
    // though the reconcile refuses to act on one. See reconcile.db-test.ts.
    expect(clubConfigSchema.parse({ meetings: [] }).meetings).toEqual([]);
  });
});
