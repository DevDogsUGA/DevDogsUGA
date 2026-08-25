import { describe, expect, it } from "vitest";
import { ROAD_LABELS } from "./campusMapData";
import { VIEW } from "./campusMapMeta";

/**
 * Street names are generated onto their own centrelines by
 * scripts/generate-campus-map.ts, which is what stops them drifting when the
 * frame moves. These check the properties that make a generated placement
 * usable at all — a name off the map, or one printed upside down, is a bug
 * the generator can produce from perfectly good geometry.
 */
describe("the street labels", () => {
  it("names some streets", () => {
    expect(ROAD_LABELS.length).toBeGreaterThan(0);
  });

  it("keeps every name inside the frame", () => {
    // Generous margin: the anchor is the middle of the text, and the text is
    // rotated, so a name anchored at the very edge hangs off both sides of it.
    for (const label of ROAD_LABELS) {
      expect(label.x, `${label.text} x`).toBeGreaterThan(8);
      expect(label.x, `${label.text} x`).toBeLessThan(VIEW.w - 8);
      expect(label.y, `${label.text} y`).toBeGreaterThan(8);
      expect(label.y, `${label.text} y`).toBeLessThan(VIEW.h - 8);
    }
  });

  it("never turns a name upside down", () => {
    // A street running north-east and the same street running south-west are
    // the same line walked in opposite directions; the generator folds the
    // bearing into this range so the text always reads left to right.
    for (const label of ROAD_LABELS) {
      expect(Math.abs(label.angle), `${label.text} angle`).toBeLessThanOrEqual(
        90,
      );
    }
  });

  it("names each street once", () => {
    const names = ROAD_LABELS.map((l) => l.text);
    expect(new Set(names).size).toBe(names.length);
  });
});
