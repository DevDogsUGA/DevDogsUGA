import { describe, expect, it } from "vitest";
import { handleFromSegment, profilePath } from "./profilePath";

describe("profilePath", () => {
  it("builds /community/@handle, lowercased", () => {
    expect(profilePath("ada")).toBe("/community/@ada");
    expect(profilePath("Ada.L")).toBe("/community/@ada.l");
  });
});

describe("handleFromSegment", () => {
  it("reads both the raw and percent-encoded @", () => {
    expect(handleFromSegment("@Ada")).toBe("ada");
    expect(handleFromSegment("%40ada")).toBe("ada");
  });

  it("rejects segments that are not profiles", () => {
    expect(handleFromSegment("ada")).toBeNull();
    expect(handleFromSegment("@")).toBeNull();
    expect(handleFromSegment("%E0%A4%A")).toBeNull();
  });
});
