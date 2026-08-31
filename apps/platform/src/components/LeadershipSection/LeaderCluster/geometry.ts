import type { CardLayout } from "./clusterLayout";

/**
 * Pure geometry for the desktop cluster's hover behaviour.
 *
 * The cluster never asks the DOM which card the mouse is over. Cards spring
 * around while a popup is open, so mouseenter on the cards themselves creates
 * a feedback loop: a card slides under the resting cursor, "hovers" itself,
 * and the layout reshuffles again. The previous implementation suppressed
 * that with a hover lock and settle timers; this one removes the loop instead
 * by hit-testing the pointer against the *resting* layout, which never moves.
 * The mapping from pointer position to hovered card is a pure function of
 * this module, so the animation state can never feed back into it.
 */

export const CONTAINER_W = 920;
export const CONTAINER_H = 660;
export const CARD_W = 120;
export const CARD_H = 180;
export const POPUP_W = 320;
/** Gap between the open card's edge and its popup. */
export const POPUP_GAP = 24;
/**
 * How far an open card slides away from its popup, so the card + popup pair
 * stays centered on the card's resting spot instead of lopsided toward one.
 */
export const OPEN_SHIFT = (POPUP_W + POPUP_GAP) / 2;

/** Forgiveness around a resting card before the pointer counts as on it. */
const HIT_PAD = 8;
/** Forgiveness around an open card + popup before the pointer lets it close. */
const STICKY_PAD = 16;

/** Right of this cx, popups open leftward; everywhere else, rightward. */
const CENTER_BAND = 50;

/** The side of the card its popup opens on. */
export type PopupSide = "left" | "right";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Popups open horizontally, toward the container's center where it matters:
 * cards on the right half open leftward so they never hang off the edge, and
 * everything else — the center column included — opens rightward, reading
 * direction.
 */
export function popupSideFor(l: CardLayout): PopupSide {
  return l.cx > CENTER_BAND ? "left" : "right";
}

/** X displacement of an open card: away from its popup. */
export function openShiftX(side: PopupSide): number {
  return side === "left" ? OPEN_SHIFT : -OPEN_SHIFT;
}

/** A card's resting center in container coordinates, scatter jitter included. */
export function cardCenter(l: CardLayout): Point {
  return {
    x: CONTAINER_W / 2 + l.cx + l.tx,
    y: CONTAINER_H / 2 + l.cy + l.ty,
  };
}

/**
 * The card whose resting footprint contains the pointer, or null. Footprints
 * can overlap once inflated by HIT_PAD; the nearest center wins so the choice
 * is unambiguous and continuous as the pointer sweeps across the cluster.
 */
export function hitTest(
  layouts: readonly CardLayout[],
  p: Point,
): number | null {
  let best: number | null = null;
  let bestDistSq = Infinity;
  layouts.forEach((l, i) => {
    const c = cardCenter(l);
    const dx = Math.abs(p.x - c.x);
    const dy = Math.abs(p.y - c.y);
    if (dx > CARD_W / 2 + HIT_PAD || dy > CARD_H / 2 + HIT_PAD) return;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = i;
    }
  });
  return best;
}

/**
 * The region an open card claims: its footprint across the whole slide from
 * resting to shifted position. Covering the slide matters at the moment of
 * opening — the pointer is still over the resting spot while the card springs
 * toward the popup, and the region must not let go of it in between.
 *
 * The caller checks this rect and the popup's measured rect separately, not
 * their bounding box: STICKY_PAD on each side of the POPUP_GAP already joins
 * them across the gap, while a bounding box of a 180px card and a
 * bio-height popup would also claim the empty corners between them.
 */
export function openRegion(l: CardLayout, shiftX: number): Rect {
  const c = cardCenter(l);
  return {
    left: Math.min(c.x, c.x + shiftX) - CARD_W / 2,
    top: c.y - CARD_H / 2,
    right: Math.max(c.x, c.x + shiftX) + CARD_W / 2,
    bottom: c.y + CARD_H / 2,
  };
}

/** Whether the pointer is inside the open card's claim, with sticky padding. */
export function holdsPointer(region: Rect, p: Point): boolean {
  return (
    p.x >= region.left - STICKY_PAD &&
    p.x <= region.right + STICKY_PAD &&
    p.y >= region.top - STICKY_PAD &&
    p.y <= region.bottom + STICKY_PAD
  );
}

/**
 * Where a card sits while another card's popup is open: pushed along the line
 * between the two resting centers, harder the closer they are, and harder in
 * x than y because the popup claims horizontal room. Returns the card's
 * animation offset with its scatter jitter folded in, the same coordinates
 * the resting offset uses.
 */
export function repelOffset(l: CardLayout, open: CardLayout): Point {
  const dx = l.cx - open.cx;
  const dy = l.cy - open.cy;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: l.tx, y: l.ty };
  const strength = Math.max(0, 1 - dist / 600) * 170;
  return {
    x: l.tx + (dx / dist) * strength * 1.5,
    y: l.ty + (dy / dist) * strength * 0.7,
  };
}

export interface PopupPlacement {
  left: number;
  top: number;
  /** CSS translate aligning the popup's near edge against the anchor point. */
  x: string;
  y: string;
  /** The edge nearest the card, so the entrance folds out from it. */
  transformOrigin: string;
}

/**
 * Where the popup lands, anchored to the open card's *settled* position (its
 * resting spot plus `shiftX`). Computing the destination up front instead of
 * tracking the card's live position means the popup unfolds in place while
 * the card springs toward it, rather than jittering after the card
 * frame by frame.
 */
export function popupPlacement(l: CardLayout, shiftX: number): PopupPlacement {
  const side = popupSideFor(l);
  const c = cardCenter(l);
  const cx = c.x + shiftX;
  if (side === "right") {
    return {
      left: cx + CARD_W / 2 + POPUP_GAP,
      top: c.y,
      x: "0%",
      y: "-50%",
      transformOrigin: "left center",
    };
  }
  return {
    left: cx - CARD_W / 2 - POPUP_GAP,
    top: c.y,
    x: "-100%",
    y: "-50%",
    transformOrigin: "right center",
  };
}
