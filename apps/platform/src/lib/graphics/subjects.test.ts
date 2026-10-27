import { describe, expect, it } from "vitest";
import {
  applyRevision,
  meetingSubjects,
  revisionDiffers,
  stemPart,
} from "./subjects";

const meeting = {
  slug: "2026-11-04-workshop-wednesday",
  startsAt: new Date("2026-11-04T23:00:00Z"),
  endsAt: new Date("2026-11-05T01:00:00Z"),
  building: "Boyd Graduate Studies",
  location: "328",
  category: "workshop" as const,
  brand: "devdogs" as const,
  kicker: "Workshop Wednesday",
  cancelledAt: null,
  cancellationReason: null,
};

const workshops = [
  { workshopId: "w1", title: "Supabase II", project: null },
  { workshopId: "w2", title: "Supabase II", project: null },
  { workshopId: "w3", title: null, project: "Flutter" },
];

describe("meetingSubjects", () => {
  const subjects = meetingSubjects({
    meeting,
    title: "Supabase II",
    workshops,
  });

  it("is the whole night first, then one subject per workshop", () => {
    expect(subjects.map((s) => [s.id, s.kind, s.label])).toEqual([
      ["meeting", "meeting", "Supabase II"],
      ["workshop-w1", "workshop", "Supabase II"],
      ["workshop-w2", "workshop", "Supabase II"],
      ["workshop-w3", "workshop", "Flutter"],
    ]);
  });

  it("gives every subject a unique filename stem", () => {
    expect(subjects.map((s) => s.stem)).toEqual([
      "2026-11-04-workshop-wednesday",
      "2026-11-04-workshop-wednesday-supabase-ii",
      "2026-11-04-workshop-wednesday-supabase-ii-2",
      "2026-11-04-workshop-wednesday-flutter",
    ]);
  });

  it("draws the night with its resolved title, kicker and category", () => {
    expect(subjects[0]!.detail).toMatchObject({
      title: "Supabase II",
      date: "Nov 4, 2026",
      time: "6:00 PM – 8:00 PM",
      location: "Boyd Graduate Studies 328",
      category: "workshop",
      kicker: "Workshop Wednesday",
      brand: "devdogs",
      agenda: [
        "Workshop: Supabase II",
        "Workshop: Supabase II",
        "Workshop: Flutter",
      ],
    });
  });

  it("badges a workshop card, with the night's time and room and no agenda", () => {
    expect(subjects[3]!.detail).toMatchObject({
      title: "Flutter",
      time: "6:00 PM – 8:00 PM",
      location: "Boyd Graduate Studies 328",
      agenda: undefined,
      badge: { label: "Workshop" },
    });
  });

  it("draws a cancelled night without its agenda or room", () => {
    const [night] = meetingSubjects({
      meeting: {
        ...meeting,
        cancelledAt: new Date("2026-11-01T00:00:00Z"),
        cancellationReason: "Weather",
      },
      title: "Workshop Wednesday",
      workshops: [],
    });
    expect(night!.detail.cancelled).toEqual({ reason: "Weather" });
    expect(night!.detail.agenda).toBeUndefined();
  });
});

describe("personal revisions (the seam; none exist yet)", () => {
  const input = { meeting, title: "Supabase II", workshops };

  it("leaves the official card alone when there is no revision", () => {
    const [night] = meetingSubjects(input);
    expect(applyRevision(night!.detail, undefined)).toBe(night!.detail);
    expect(revisionDiffers(night!.detail, undefined)).toBe(false);
  });

  it("overlays only the revised fields, on the night and on its workshops", () => {
    const official = meetingSubjects(input);
    const revised = meetingSubjects({
      ...input,
      revision: { time: "7:00 PM – 9:00 PM", location: "Zoom" },
    });
    expect(revised[0]!.detail).toMatchObject({
      title: "Supabase II",
      date: "Nov 4, 2026",
      time: "7:00 PM – 9:00 PM",
      location: "Zoom",
    });
    expect(revised[1]!.detail.time).toBe("7:00 PM – 9:00 PM");
    expect(revisionDiffers(official[0]!.detail, { location: "Zoom" })).toBe(
      true,
    );
    expect(
      revisionDiffers(official[0]!.detail, {
        location: official[0]!.detail.location,
      }),
    ).toBe(false);
  });
});

describe("stemPart", () => {
  it("makes a filename-safe word and never an empty one", () => {
    expect(stemPart("Next.js & Flutter!")).toBe("next-js-flutter");
    expect(stemPart("日本語")).toBe("workshop");
  });
});
