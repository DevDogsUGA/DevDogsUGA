import { describe, expect, it } from "vitest";
import { clubConfigSchema, meetingSchema, workshopSchema } from "./schema";

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

describe("workshopSchema", () => {
  it("accepts a minimal workshop", () => {
    expect(workshopSchema.parse(workshop())).toMatchObject({ id: "supabase" });
  });

  it("accepts a free-text project recommendation", () => {
    const parsed = workshopSchema.parse(
      workshop({ project: "DogDays & DogPack" }),
    );
    expect(parsed.project).toBe("DogDays & DogPack");
  });

  it("rejects an id with spaces", () => {
    expect(() =>
      workshopSchema.parse(workshop({ id: "not a slug" })),
    ).toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => workshopSchema.parse(workshop({ title: "" }))).toThrow();
  });
});

describe("meetingSchema", () => {
  it("accepts a minimal meeting", () => {
    expect(meetingSchema.parse(meeting())).toMatchObject({ id: "cold-start" });
  });

  it("accepts a legacy migrated record id shape", () => {
    expect(meetingSchema.parse(meeting({ id: "rectaW4iGmfDA3uwQ" })).id).toBe(
      "rectaW4iGmfDA3uwQ",
    );
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

  it("rejects a kind outside the closed list", () => {
    expect(() =>
      meetingSchema.parse(meeting({ kind: "Karaoke Night" })),
    ).toThrow();
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
