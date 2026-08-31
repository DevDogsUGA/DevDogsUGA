import { describe, expect, it } from "vitest";
import { computeClusterLayout, type CardLayout } from "./clusterLayout";
import {
  CARD_W,
  CLEAR_X,
  CLEAR_Y,
  CONTAINER_H,
  CONTAINER_W,
  OPEN_SHIFT,
  POPUP_W,
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
  it("opens right-half cards leftward and everything else rightward", () => {
    expect(popupSideFor({ cx: 300, cy: 0, deg: 0, tx: 0, ty: 0 })).toBe("left");
    expect(popupSideFor({ cx: -300, cy: 0, deg: 0, tx: 0, ty: 0 })).toBe(
      "right",
    );
    // Center-column cards open rightward too, wherever they sit vertically.
    expect(popupSideFor({ cx: 10, cy: -200, deg: 0, tx: 0, ty: 0 })).toBe(
      "right",
    );
    expect(popupSideFor({ cx: -10, cy: 200, deg: 0, tx: 0, ty: 0 })).toBe(
      "right",
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

  it("tracks repelled footprints while another card is open", () => {
    const open: CardLayout = { cx: -300, cy: 0, deg: 0, tx: 0, ty: 0 };
    const neighbor: CardLayout = { cx: 0, cy: 0, deg: 0, tx: 0, ty: 0 };
    const pushed = repelOffset(neighbor, open);
    // The push is big enough to carry the card clear of its own resting
    // footprint — which is exactly why resting-only hit-testing loses it.
    expect(pushed.x).toBeGreaterThan(CARD_W / 2);
    const p = { x: CONTAINER_W / 2 + pushed.x, y: CONTAINER_H / 2 };
    expect(hitTest([open, neighbor], p)).toBeNull();
    expect(hitTest([open, neighbor], p, open)).toBe(1);
  });

  it("claims the whole swept band between resting and repelled footprints", () => {
    const open: CardLayout = { cx: -140, cy: 0, deg: 0, tx: 0, ty: 0 };
    const neighbor: CardLayout = { cx: 0, cy: 0, deg: 0, tx: 0, ty: 0 };
    const pushed = repelOffset(neighbor, open);
    // This close a pair, the flight exceeds a card-width, so a probe halfway
    // along it sits in the dead gap between the two footprints…
    expect(pushed.x).toBeGreaterThan(CARD_W + 16);
    const p = { x: CONTAINER_W / 2 + pushed.x / 2, y: CONTAINER_H / 2 };
    expect(p.x).toBeGreaterThan(CONTAINER_W / 2 + CARD_W / 2 + 8);
    expect(p.x).toBeLessThan(CONTAINER_W / 2 + pushed.x - CARD_W / 2 - 8);
    // …caught while the neighbor is repelled, empty once everything rests.
    expect(hitTest([open, neighbor], p)).toBeNull();
    expect(hitTest([open, neighbor], p, open)).toBe(1);
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
      left: place.left - POPUP_W,
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
  });

  it("anchors the popup against the shifted card's near edge", () => {
    const l: CardLayout = { cx: -300, cy: 0, deg: 0, tx: 0, ty: 0 }; // side: right
    const shift = openShiftX("right");
    const place = popupPlacement(l, shift);
    expect(place.left).toBe(at(l).x + shift + CARD_W / 2 + 24);
    expect(place.transformOrigin).toBe("left center");
  });

  it("opens center-column cards rightward, vertically centered on the card", () => {
    const l: CardLayout = { cx: 0, cy: -240, deg: 0, tx: 0, ty: 0 };
    const shift = openShiftX(popupSideFor(l));
    const place = popupPlacement(l, shift);
    expect(place.left).toBe(at(l).x - OPEN_SHIFT + CARD_W / 2 + 24);
    expect(place.top).toBe(at(l).y);
    expect(place.y).toBe("-50%");
    expect(place.transformOrigin).toBe("left center");
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

  it("extends the push until a diagonal neighbor clears the pair's zone", () => {
    // A middle-arc pair: the plain radial push splits between x and y and
    // clears neither the popup's far edge nor its bottom.
    const open: CardLayout = { cx: -145, cy: -180, deg: 0, tx: 0, ty: 0 };
    const diag: CardLayout = { cx: 1, cy: -4, deg: 0, tx: 0, ty: 0 };
    const off = repelOffset(diag, open);
    const relX = Math.abs(diag.cx + off.x - open.cx);
    const relY = Math.abs(diag.cy + off.y - open.cy);
    expect(Math.max(relX - CLEAR_X, relY - CLEAR_Y)).toBeGreaterThan(-0.01);
    // The extension keeps the push's own direction: still down-and-right.
    expect(off.x).toBeGreaterThan(0);
    expect(off.y).toBeGreaterThan(0);
  });

  it("weakens with distance until it vanishes", () => {
    const open: CardLayout = { cx: 0, cy: 0, deg: 0, tx: 0, ty: 0 };
    const near: CardLayout = { cx: 150, cy: 0, deg: 0, tx: 0, ty: 0 };
    const far: CardLayout = { cx: 650, cy: 0, deg: 0, tx: 0, ty: 0 };
    expect(repelOffset(near, open).x).toBeGreaterThan(repelOffset(far, open).x);
    expect(repelOffset(far, open)).toEqual({ x: far.tx, y: far.ty });
  });
});
