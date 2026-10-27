import { describe, expect, it } from "vitest";
import { getVenues, getWorkshops } from "./index";
import { validateCatalog } from "./validator";
import { legacyPlace, type Venue } from "./venues";

const dlw: Venue = {
  id: "dlw",
  kind: "campus",
  name: "Dining, Learning, and Well-Being Center",
  shortName: "DLW",
  building: "DLW",
};

describe("legacyPlace", () => {
  it("keeps a campus-map building as its code plus the room", () => {
    expect(legacyPlace(dlw, "124")).toEqual({
      building: "DLW",
      location: "124",
    });
    expect(legacyPlace(dlw, null)).toEqual({
      building: "DLW",
      location: "TBA",
    });
  });

  it("prints other campus ground and online events under Other", () => {
    const dawson: Venue = {
      id: "dawson-hall",
      kind: "campus",
      name: "Dawson Hall",
      shortName: "Dawson",
    };
    expect(legacyPlace(dawson, "110")).toEqual({
      building: "Other",
      location: "Dawson 110",
    });
    expect(
      legacyPlace({ id: "virtual", kind: "virtual", name: "Virtual" }, "Bevy"),
    ).toEqual({ building: "Other", location: "Virtual — Bevy" });
  });

  it("gives off campus and to-be-announced places no building", () => {
    expect(
      legacyPlace(
        {
          id: "morehouse-college",
          kind: "offCampus",
          name: "Morehouse College",
          address: "Atlanta, GA",
          locality: "Atlanta",
        },
        null,
      ),
    ).toEqual({ building: null, location: "Morehouse College, Atlanta" });
    expect(legacyPlace({ id: "tba", kind: "tba", name: "TBA" }, null)).toEqual({
      building: null,
      location: "TBA",
    });
  });
});

describe("validateCatalog", () => {
  const codes = (workshops: unknown[], venues: unknown[]) =>
    validateCatalog(
      { workshops: workshops as never },
      {
        venues: venues as never,
      },
    ).map((i) => i.code);

  it("accepts the committed catalogs", () => {
    expect(validateCatalog(getWorkshops(), getVenues())).toEqual([]);
  });

  it("refuses duplicate ids", () => {
    const w = { id: "a", title: "A", description: null, project: null };
    expect(codes([w, w], [dlw, dlw])).toEqual([
      "duplicate_workshop_id",
      "duplicate_venue_id",
    ]);
  });

  it("needs an address off campus, and a building only on campus", () => {
    expect(codes([], [{ id: "x", kind: "offCampus", name: "X" }])).toEqual([
      "venue_needs_address",
    ]);
    expect(
      codes([], [{ id: "x", kind: "virtual", name: "X", building: "DLW" }]),
    ).toEqual(["venue_building_not_campus"]);
  });

  it("covers each of the map's ten buildings exactly once", () => {
    const buildings = getVenues()
      .venues.flatMap((v) => (v.building === undefined ? [] : [v.building]))
      .sort();
    expect(buildings).toHaveLength(10);
    expect(new Set(buildings).size).toBe(10);
  });
});
