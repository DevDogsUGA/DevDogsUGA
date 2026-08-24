import { describe, expect, it } from "vitest";
import { MEETING_BUILDING_CHOICES as FROM_AIRTABLE } from "@devdogsuga/airtable";
import { HIGHLIGHT_PATHS, HIGHLIGHT_PINS } from "./campusMapData";
import { BUILDING_CENTERS, BUILDING_KEYS, VIEW } from "./campusMapMeta";
import {
  BUILDING_LABEL,
  BUILDING_NAME,
  MEETING_BUILDING_CHOICES,
  isMappedBuilding,
  locationLine,
} from "./buildings";

/**
 * Four lists have to say the same thing about which buildings exist: the
 * Airtable dropdown, the check constraint behind it, the generated map data,
 * and the label tables here. Three of them are code and can be compared; the
 * fourth is a migration, which these cannot read.
 *
 * The failure they are guarding against is quiet. A building in the dropdown
 * with no footprint is a dialog with a pin over empty ground, and a building
 * on the map that Airtable cannot offer is simply unreachable — neither throws,
 * neither shows up in a build, and both are found by a member standing in the
 * wrong place.
 */
describe("the building list", () => {
  it("matches the copy in packages/airtable", () => {
    // Order too, not just membership: this is the order officers see in the
    // dropdown, and `BUILDING_KEYS` is what fixes it.
    expect([...MEETING_BUILDING_CHOICES]).toEqual([...FROM_AIRTABLE]);
  });

  it("offers exactly the buildings the map can draw, plus Other", () => {
    expect([...MEETING_BUILDING_CHOICES]).toEqual([...BUILDING_KEYS, "Other"]);
  });

  it("has a footprint, a pin and a centroid for every drawable building", () => {
    for (const key of BUILDING_KEYS) {
      expect(HIGHLIGHT_PATHS[key], `${key} footprint`).toMatch(/^M/);
      expect(BUILDING_CENTERS[key], `${key} centroid`).toBeDefined();

      // Inside the frame, not merely present. A pin whose coordinates fall
      // outside the viewBox is the exact shape of a reframing that moved the
      // map and left one building behind, and it renders as a map with no pin
      // on it rather than as an error.
      const pin = HIGHLIGHT_PINS[key]!;
      expect(pin.x, `${key} pin x`).toBeGreaterThan(0);
      expect(pin.x, `${key} pin x`).toBeLessThan(VIEW.w);
      expect(pin.y, `${key} pin y`).toBeGreaterThan(0);
      expect(pin.y, `${key} pin y`).toBeLessThan(VIEW.h);
    }
  });

  it("names every drawable building twice, short and long", () => {
    for (const key of BUILDING_KEYS) {
      expect(BUILDING_LABEL[key], `${key} label`).toBeTruthy();
      expect(BUILDING_NAME[key], `${key} name`).toBeTruthy();
    }
  });
});

describe("isMappedBuilding", () => {
  it("accepts a building the map draws", () => {
    expect(isMappedBuilding("DLW")).toBe(true);
    expect(isMappedBuilding("Driftmier")).toBe(true);
  });

  it("rejects Other, null, and anything unrecognised", () => {
    // `Other` is a real stored value and still must not reach the map, which
    // is the case a plain null check would miss.
    expect(isMappedBuilding("Other")).toBe(false);
    expect(isMappedBuilding(null)).toBe(false);
    expect(isMappedBuilding("Snelling")).toBe(false);
  });
});

describe("locationLine", () => {
  it("joins the short name and the room", () => {
    expect(locationLine("DLW", "124")).toBe("DLW 124");
    expect(locationLine("Science Learning Center", "101")).toBe("SLC 101");
  });

  it("copes with either half missing", () => {
    expect(locationLine("Boyd", null)).toBe("Boyd");
    expect(locationLine(null, "Room 148")).toBe("Room 148");
  });

  it("says nothing at all rather than nothing useful", () => {
    // Null, not "", so the caller can print its own "to be announced".
    expect(locationLine(null, null)).toBeNull();
  });

  it("never prints the word Other", () => {
    // It describes this app's coverage, not a place. On a public page beside
    // a date it would read as the name of a venue.
    expect(locationLine("Other", "Tate 137")).toBe("Tate 137");
    expect(locationLine("Other", null)).toBeNull();
  });
});
