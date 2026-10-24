import { describe, expect, it } from "vitest";
import { FIELDS, parseItem, toFormText } from "./editFields";

const meeting = (over: Record<string, string> = {}) => ({
  slug: "2026-10-05-judging",
  startsAt: "2026-10-05T18:00",
  endsAt: "2026-10-05T19:30",
  agenda: "",
  ...over,
});

describe("parseItem", () => {
  it("turns Eastern wall-clock times into UTC instants", () => {
    const { item, errors } = parseItem("meeting", meeting());
    expect(errors).toEqual([]);
    expect(item.startsAt).toBe("2026-10-05T22:00:00.000Z");
    expect(item.endsAt).toBe("2026-10-05T23:30:00.000Z");
  });

  it("drops an empty optional field, nulls an empty nullable one", () => {
    const { item } = parseItem("meeting", meeting({ title: "" }));
    expect("title" in item).toBe(false);
    expect(item.rsvpUrl).toBeNull();
    expect(item.cancelledAt).toBeNull();
  });

  it("requires the required fields and a real time", () => {
    const { errors } = parseItem(
      "meeting",
      meeting({ startsAt: "", endsAt: "soon" }),
    );
    expect(errors).toEqual([
      "Starts is required.",
      "Ends is not a valid date and time.",
    ]);
  });

  it("reads an agenda with a per-night description", () => {
    const { item } = parseItem(
      "meeting",
      meeting({ agenda: "nextjs\nflutter | Hands on tonight\n\n" }),
    );
    expect(item.agenda).toEqual([
      "nextjs",
      { workshop: "flutter", description: "Hands on tonight" },
    ]);
  });

  it("reads lines into a list and a number", () => {
    const { item } = parseItem("workshop", {
      id: "x",
      title: "X",
      elHours: "1.5",
      topics: "web\nmobile",
    });
    expect(item.elHours).toBe(1.5);
    expect(item.topics).toEqual(["web", "mobile"]);
  });

  it("rejects a non-number", () => {
    expect(
      parseItem("workshop", { id: "x", title: "X", elHours: "lots" }).errors,
    ).toContain("EL hours must be a number.");
  });
});

describe("toFormText", () => {
  it("round-trips an item through the form", () => {
    const item = {
      slug: "2026-10-05",
      startsAt: "2026-10-05T22:00:00.000Z",
      endsAt: "2026-10-05T23:30:00.000Z",
      rsvpUrl: null,
      cancelledAt: null,
      cancellationReason: null,
      surveyUrl: null,
      agenda: ["nextjs", { workshop: "flutter", description: "Tonight" }],
    };
    const text = Object.fromEntries(
      FIELDS.meeting.map((f) => [f.name, toFormText(f, item)]),
    );
    expect(parseItem("meeting", text).item).toEqual(item);
  });
});
