import { describe, expect, it } from "vitest";
import {
  directionsQuery,
  directionsTarget,
  placeOfMeeting,
} from "./placeLookup";

const venueId = (place: ReturnType<typeof directionsTarget>) =>
  place.state === "known" ? place.venue.id : null;
const roomOf = (place: ReturnType<typeof directionsTarget>) =>
  place.state === "known" ? place.room : undefined;

describe("directionsTarget", () => {
  it("answers a link naming nothing with the usual room", () => {
    const place = directionsTarget(undefined, undefined, undefined);
    expect(venueId(place)).toBe("dlw");
    expect(roomOf(place)).toBe("124");
  });

  it("keeps the old building links working", () => {
    expect(venueId(directionsTarget(undefined, "Boyd", undefined))).toBe(
      "boyd",
    );
    expect(roomOf(directionsTarget(undefined, "Boyd", undefined))).toBeNull();
    expect(roomOf(directionsTarget(undefined, "DLW", undefined))).toBe("124");
    expect(roomOf(directionsTarget(undefined, "DLW", "110"))).toBe("110");
  });

  it("takes a venue id, off campus and online included", () => {
    expect(venueId(directionsTarget("morehouse-college", null, null))).toBe(
      "morehouse-college",
    );
    expect(venueId(directionsTarget("virtual", null, "Bevy"))).toBe("virtual");
    expect(roomOf(directionsTarget("dawson-hall", null, "110"))).toBe("110");
  });

  it("does not give a named venue the DLW's usual room", () => {
    expect(roomOf(directionsTarget("dlw", null, null))).toBeNull();
  });

  it("never turns an unknown place into the DLW", () => {
    for (const place of [
      directionsTarget(undefined, "Nowhere", undefined),
      directionsTarget(undefined, "Other", undefined),
      directionsTarget("dlw-124", undefined, undefined),
      directionsTarget("dlw", "Boyd", "x".repeat(41)),
      directionsTarget(undefined, ["DLW", "Boyd"], undefined),
      directionsTarget(undefined, undefined, "124"),
      directionsTarget(undefined, "DLW", "12\n4"),
    ]) {
      expect(place).toEqual({ state: "unknown" });
    }
  });

  it("lets a venue id win over a building", () => {
    expect(venueId(directionsTarget("tate", "Boyd", null))).toBe("tate");
  });
});

describe("placeOfMeeting", () => {
  const base = {
    slug: "2026-10-12",
    venue: null,
    room: null,
    building: null,
    location: null,
  };

  it("reads a rewritten row's venue and room", () => {
    const place = placeOfMeeting({ ...base, venue: "dlw", room: "124" });
    expect(place).toMatchObject({ state: "known", room: "124" });
  });

  it("reads an older row's mapped building and room line", () => {
    const place = placeOfMeeting({
      ...base,
      building: "Tate",
      location: "137",
    });
    expect(venueId(place)).toBe("tate");
    expect(roomOf(place)).toBe("137");
  });

  it("is unknown for a venue id the catalog lacks, or an old unmapped row", () => {
    expect(placeOfMeeting({ ...base, venue: "gone" })).toEqual({
      state: "unknown",
    });
    expect(
      placeOfMeeting({ ...base, building: "Other", location: "Tate 137" }),
    ).toEqual({ state: "unknown" });
  });

  it("carries the join link authored on the meeting, null when it has none", () => {
    const place = placeOfMeeting({
      ...base,
      slug: "2026-10-11",
      venue: "virtual",
      room: "Bevy (recorded)",
    });
    expect(place).toMatchObject({ state: "known", joinUrl: null });
  });
});

describe("directionsQuery", () => {
  it("reproduces a place, and nothing for an unknown one", () => {
    const place = directionsTarget("dawson-hall", null, "110");
    expect(directionsQuery(place)).toBe("v=dawson-hall&r=110");
    expect(directionsQuery({ state: "unknown" })).toBe("");
  });
});
