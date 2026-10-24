import { describe, expect, it } from "vitest";
import type { Venue } from "@devdogsuga/events";
import { describePlace, hasDirections, type Place } from "./place";

const known = (
  venue: Venue,
  room: string | null = null,
  joinUrl = null,
): Place => ({
  state: "known",
  venue,
  room,
  joinUrl,
});

const dlw: Venue = {
  id: "dlw",
  kind: "campus",
  name: "Dining, Learning, and Well-Being Center",
  shortName: "DLW",
  building: "DLW",
  address: "301 E Cloverhurst Ave, Athens, GA 30605",
};
const dawson: Venue = {
  id: "dawson-hall",
  kind: "campus",
  name: "Dawson Hall",
  shortName: "Dawson",
};
const morehouse: Venue = {
  id: "morehouse-college",
  kind: "offCampus",
  name: "Morehouse College",
  address: "Morehouse College, Atlanta, GA",
  locality: "Atlanta",
};
const virtual: Venue = { id: "virtual", kind: "virtual", name: "Virtual" };
const tba: Venue = { id: "tba", kind: "tba", name: "TBA" };

describe("describePlace", () => {
  it("draws a mapped campus building and says it is unverified", () => {
    const view = describePlace(known(dlw, "124"));
    expect(view.title).toBe("DLW 124");
    expect(view.mapBuilding).toBe("DLW");
    expect(view.rows).toContainEqual({ label: "Room", value: "124" });
    expect(view.paragraphs.join(" ")).toMatch(/room 124/);
    expect(view.verified).toBeNull();
    expect(view.unverifiedNote).toMatch(/haven't verified/);
    expect(view.links.map((l) => l.label)).toEqual([
      "Google Maps",
      "Apple Maps",
    ]);
    expect(view.links[0]!.url).toContain("destination=33.");
  });

  it("shows verified details with the date and drops the unverified note", () => {
    const view = describePlace(
      known(
        {
          ...dlw,
          verified: {
            verifiedOn: "2026-11-02",
            entrance: "Use the north door.",
            accessibleRoute: "Elevator B to the first floor.",
          },
        },
        "124",
      ),
    );
    expect(view.verified).toMatchObject({ verifiedOn: "2026-11-02" });
    expect(view.unverifiedNote).toBeNull();
  });

  it("gives an unmapped campus space text and no map", () => {
    const view = describePlace(known(dawson, "110"));
    expect(view.title).toBe("Dawson 110");
    expect(view.mapBuilding).toBeNull();
    expect(view.links).toEqual([]);
    expect(view.unverifiedNote).not.toBeNull();
  });

  it("gives an off-campus venue its address and navigation links, no map", () => {
    const view = describePlace(known(morehouse));
    expect(view.title).toBe("Morehouse College, Atlanta");
    expect(view.mapBuilding).toBeNull();
    expect(view.rows[0]).toEqual({ label: "Venue", value: morehouse.name });
    expect(view.rows).toContainEqual({
      label: "Address",
      value: "Morehouse College, Atlanta, GA",
    });
    expect(view.links[0]!.url).toContain(
      encodeURIComponent("Morehouse College, Atlanta, GA"),
    );
    expect(view.unverifiedNote).toBeNull();
  });

  it("offers the join link for an online night, else points at Bevy", () => {
    const withLink = describePlace(
      known(virtual, null, "https://meet.example.org/x" as never),
    );
    expect(withLink.links).toEqual([
      { label: "Join online", url: "https://meet.example.org/x" },
    ]);
    const without = describePlace(known(virtual, "Bevy (recorded)"));
    expect(without.links).toEqual([]);
    expect(without.paragraphs.join(" ")).toMatch(/Bevy and the event page/);
    expect(without.title).toBe("Virtual — Bevy (recorded)");
  });

  it("says a to-be-announced place is pending", () => {
    const view = describePlace(known(tba));
    expect(view.title).toBe("Location pending");
    expect(view.paragraphs.join(" ")).toMatch(/pending/);
  });

  it("says it does not know an unknown place", () => {
    const view = describePlace({ state: "unknown" });
    expect(view.title).toBe("We don't know that place");
    expect(view.mapBuilding).toBeNull();
    expect(view.rows).toEqual([]);
    expect(view.links).toEqual([]);
  });
});

describe("hasDirections", () => {
  it("is true for anything with a map, an address or a join link", () => {
    expect(hasDirections(known(dlw, "124"))).toBe(true);
    expect(hasDirections(known(morehouse))).toBe(true);
    expect(
      hasDirections(
        known(virtual, null, "https://meet.example.org/x" as never),
      ),
    ).toBe(true);
  });

  it("is false where there is nothing to open", () => {
    expect(hasDirections(known(dawson, "110"))).toBe(false);
    expect(hasDirections(known(virtual, "Bevy (recorded)"))).toBe(false);
    expect(hasDirections(known(tba))).toBe(false);
    expect(hasDirections({ state: "unknown" })).toBe(false);
  });
});
