import { describe, expect, it } from "vitest";
import { clubConfigSchema, meetingSchema, workshopSchema } from "./schema";

function workshop(overrides: Record<string, unknown> = {}) {
  return {
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

describe("workshopSchema", () => {
  it("accepts a minimal workshop", () => {
    expect(workshopSchema.parse(workshop())).toMatchObject({
      title: "Supabase",
    });
  });

  it("accepts a free-text project recommendation", () => {
    const parsed = workshopSchema.parse(
      workshop({ project: "DogDays & DogPack" }),
    );
    expect(parsed.project).toBe("DogDays & DogPack");
  });

  it("rejects an id: the title is a workshop's identity", () => {
    expect(() => workshopSchema.parse(workshop({ id: "supabase" }))).toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => workshopSchema.parse(workshop({ title: "" }))).toThrow();
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

  it.each(["title", "summary", "location"])(
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
      location: undefined,
      building: undefined,
    });
    expect(parsed.series).toBe("merge-monday");
  });

  it("rejects a building outside the closed list", () => {
    expect(() =>
      meetingSchema.parse(meeting({ building: "The Moon" })),
    ).toThrow();
  });

  it("carries a nested agenda of workshops", () => {
    const parsed = meetingSchema.parse(meeting({ agenda: [workshop()] }));
    expect(parsed.agenda).toHaveLength(1);
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
