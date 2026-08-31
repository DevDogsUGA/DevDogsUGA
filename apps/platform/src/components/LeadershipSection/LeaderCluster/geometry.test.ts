import { describe, expect, it } from "vitest";
import { computeClusterLayout, type CardLayout } from "./clusterLayout";
import {
  CARD_H,
  CARD_W,
  CONTAINER_H,
  CONTAINER_W,
  OPEN_SHIFT,
  cardCenter,
  hitTest,
  holdsPointer,
  openRegion,
  openShiftX,
  popupPlacement,
  popupSideFor,
  repelOffset,
} from "./geometry";

const at = (l: CardLayout) => cardCenter(l);

describe("popupSideFor", () => {
  it("opens toward the container center", () => {
    expect(popupSideFor({ cx: 300, cy: 0, deg: 0, tx: 0, ty: 0 })).toBe("left");
    expect(popupSideFor({ cx: -300, cy: 0, deg: 0, tx: 0, ty: 0 })).toBe(
      "right",
    );
    expect(popupSideFor({ cx: 10, cy: -200, deg: 0, tx: 0, ty: 0 })).toBe(
      "bottom",
    );
    expect(popupSideFor({ cx: -10, cy: 200, deg: 0, tx: 0, ty: 0 })).toBe(
      "top",
    );
  });
});

describe("hitTest", () => {
  const layout = computeClusterLayout(7);

  it("maps every card's resting center back to that card", () => {
    layout.forEach((l, i) => {
      expect(hitTest(layout, at(l))).toBe(i);
    });
  });

  it("misses points outside every footprint", () => {
    expect(hitTest(layout, { x: 0, y: 0 })).toBeNull();
    expect(hitTest(layout, { x: CONTAINER_W, y: CONTAINER_H })).toBeNull();
  });

  it("prefers the nearer center where inflated footprints overlap", () => {
    const a: CardLayout = { cx: -70, cy: 0, deg: 0, tx: 0, ty: 0 };
    const b: CardLayout = { cx: 50, cy: 0, deg: 0, tx: 0, ty: 0 };
    // Halfway between them, 4px nearer to b.
    expect(
      hitTest([a, b], { x: CONTAINER_W / 2 - 6, y: CONTAINER_H / 2 }),
    ).toBe(1);
  });
});

describe("openRegion", () => {
  it("covers the card at rest and at its shifted destination", () => {
    const l: CardLayout = { cx: 300, cy: 0, deg: 0, tx: 2, ty: -3 };
    const shift = openShiftX(popupSideFor(l));
    const region = openRegion(l, shift);
    const c = at(l);
    expect(holdsPointer(region, c)).toBe(true);
    expect(holdsPointer(region, { x: c.x + shift, y: c.y })).toBe(true);
    // Past the shifted card's far edge is not claimed.
    expect(holdsPointer(region, { x: c.x + shift + CARD_W, y: c.y })).toBe(
      false,
    );
  });

  it("meets the popup's padded rect across the gap, with no seam", () => {
    const l: CardLayout = { cx: 300, cy: 0, deg: 0, tx: 0, ty: 0 };
    const shift = openShiftX(popupSideFor(l)); // popup on the left
    const place = popupPlacement(l, shift);
    // The popup's on-screen box: x:-100% puts its right edge at place.left.
    const popupRect = {
      left: place.left - 256,
      right: place.left,
      top: place.top - 150,
      bottom: place.top + 150,
    };
    // Every x across the POPUP_GAP corridor is held by one rect or the other.
    const c = at(l);
    const cardLeftEdge = c.x + shift - CARD_W / 2;
    for (let x = place.left; x <= cardLeftEdge; x += 2) {
      const p = { x, y: place.top };
      expect(
        holdsPointer(openRegion(l, shift), p) || holdsPointer(popupRect, p),
      ).toBe(true);
    }
  });
});

describe("openShiftX / popupPlacement", () => {
  it("slides the card opposite its popup so the pair stays centered", () => {
    expect(openShiftX("left")).toBe(OPEN_SHIFT);
    expect(openShiftX("right")).toBe(-OPEN_SHIFT);
    expect(openShiftX("top")).toBe(0);
    expect(openShiftX("bottom")).toBe(0);
  });

  it("anchors the popup against the shifted card's near edge", () => {
    const l: CardLayout = { cx: -300, cy: 0, deg: 0, tx: 0, ty: 0 }; // side: right
    const shift = openShiftX("right");
    const place = popupPlacement(l, shift);
    expect(place.left).toBe(at(l).x + shift + CARD_W / 2 + 24);
    expect(place.transformOrigin).toBe("left center");
  });

  it("centers vertical popups on the card and clears by the card height", () => {
    const l: CardLayout = { cx: 0, cy: -240, deg: 0, tx: 0, ty: 0 }; // side: bottom
    const place = popupPlacement(l, 0);
    expect(place.left).toBe(at(l).x);
    expect(place.top).toBe(at(l).y + CARD_H / 2 + 24);
    expect(place.x).toBe("-50%");
  });
});

describe("repelOffset", () => {
  it("pushes cards directly away from a horizontally-opening card", () => {
    const open: CardLayout = { cx: 300, cy: 0, deg: 0, tx: 0, ty: 0 };
    const right: CardLayout = { cx: 400, cy: 0, deg: 0, tx: 0, ty: 0 };
    const above: CardLayout = { cx: 300, cy: -200, deg: 0, tx: 0, ty: 0 };
    expect(repelOffset(right, open).x).toBeGreaterThan(right.tx);
    expect(repelOffset(above, open).y).toBeLessThan(0);
  });

  it("clears cards sideways out of a vertical popup's path", () => {
    const open: CardLayout = { cx: 10, cy: -240, deg: 0, tx: 0, ty: 0 }; // opens downward
    const inPath: CardLayout = { cx: 30, cy: -40, deg: 0, tx: 0, ty: 0 };
    const off = repelOffset(inPath, open);
    // Right-half card dives right, and never into the popup's vertical lane.
    expect(off.x).toBeGreaterThan(50);
    expect(off.y).toBe(0);
  });

  it("weakens with distance until it vanishes", () => {
    const open: CardLayout = { cx: 0, cy: 0, deg: 0, tx: 0, ty: 0 };
    const near: CardLayout = { cx: 150, cy: 0, deg: 0, tx: 0, ty: 0 };
    const far: CardLayout = { cx: 650, cy: 0, deg: 0, tx: 0, ty: 0 };
    expect(repelOffset(near, open).x).toBeGreaterThan(repelOffset(far, open).x);
    expect(repelOffset(far, open)).toEqual({ x: far.tx, y: far.ty });
  });
});
