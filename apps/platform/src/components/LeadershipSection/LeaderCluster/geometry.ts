import type { CardLayout } from "./clusterLayout";

/**
 * Pure geometry for the desktop cluster's hover behaviour.
 *
 * The cluster never asks the DOM which card the mouse is over. Cards spring
 * around while a popup is open, so mouseenter on the cards themselves creates
 * a feedback loop: a card slides under the resting cursor, "hovers" itself,
 * and the layout reshuffles again. The previous implementation suppressed
 * that with a hover lock and settle timers; this one removes the loop instead
 * by hit-testing the pointer against the layout the current state *says* is
 * displayed — resting, or repelled by the open card — never against live DOM
 * positions. The mapping from pointer position to hovered card is a pure
 * function of this module, so the animation itself can never feed back into it.
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

/** Nominal popup height when planning repulsion; the real height tracks the bio. */
const POPUP_CLEAR_H = 360;
/**
 * Half-extents of the zone a repelled card's center must leave to stand fully
 * clear of an open pair's hold region: the pair's claim (x: card + slide +
 * popup, which is symmetric about the resting center; y: the taller of card
 * and popup) plus STICKY_PAD, plus the fleeing card's own half-size and a
 * margin absorbing its scatter jitter.
 */
export const CLEAR_X = OPEN_SHIFT + CARD_W / 2 + STICKY_PAD + CARD_W / 2 + 8;
export const CLEAR_Y = POPUP_CLEAR_H / 2 + STICKY_PAD + CARD_H / 2 + 8;

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
 * The card whose footprint contains the pointer, or null. While a card is
 * open its neighbours stand repelled, so — mirroring what `openRegion` does
 * for the open card itself — each neighbour claims the whole swept band from
 * its resting footprint to its repelled one, not just one end. Either end
 * alone fails in practice: aim at the resting spot and the card has already
 * fled; chase it to its repelled spot and a flight longer than a card-width
 * leaves a dead gap after the hold region, where everything closes and the
 * card springs back behind the cursor. Claims can overlap; the card whose
 * resting→repelled segment is nearest wins, so the choice is unambiguous and
 * continuous as the pointer sweeps across.
 */
export function hitTest(
  layouts: readonly CardLayout[],
  p: Point,
  open?: CardLayout,
): number | null {
  let best: number | null = null;
  let bestDistSq = Infinity;
  layouts.forEach((l, i) => {
    const r = cardCenter(l);
    const off = open ? repelOffset(l, open) : { x: l.tx, y: l.ty };
    const d = {
      x: CONTAINER_W / 2 + l.cx + off.x,
      y: CONTAINER_H / 2 + l.cy + off.y,
    };
    if (
      p.x < Math.min(r.x, d.x) - CARD_W / 2 - HIT_PAD ||
      p.x > Math.max(r.x, d.x) + CARD_W / 2 + HIT_PAD ||
      p.y < Math.min(r.y, d.y) - CARD_H / 2 - HIT_PAD ||
      p.y > Math.max(r.y, d.y) + CARD_H / 2 + HIT_PAD
    ) {
      return;
    }
    // Rank by distance to the resting→repelled segment: how near the pointer
    // is to anywhere the card stands along its spring. With no card open the
    // segment is a point and this is the plain nearest-center rule.
    const vx = d.x - r.x;
    const vy = d.y - r.y;
    const lenSq = vx * vx + vy * vy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - r.x) * vx + (p.y - r.y) * vy) / lenSq),
          );
    const dx = p.x - (r.x + t * vx);
    const dy = p.y - (r.y + t * vy);
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
 * x than y because the popup claims horizontal room. The cluster is a narrow
 * arc and the popup spans nearly its whole width, so that push alone can
 * strand a diagonal neighbour half-hidden under the popup — mostly invisible
 * and, because the hold region owns the pointer there, mostly untargetable.
 * When the pushed footprint would still sit inside the pair's claimed zone,
 * the push extends along its own direction until the card stands fully clear,
 * so every neighbour ends up whole and visible around the popup. Returns the
 * card's animation offset with its scatter jitter folded in, the same
 * coordinates the resting offset uses.
 */
export function repelOffset(l: CardLayout, open: CardLayout): Point {
  const dx = l.cx - open.cx;
  const dy = l.cy - open.cy;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: l.tx, y: l.ty };
  const strength = Math.max(0, 1 - dist / 600) * 170;
  let vx = (dx / dist) * strength * 1.5;
  let vy = (dy / dist) * strength * 0.7;
  const len = Math.hypot(vx, vy);
  if (
    len > 0 &&
    Math.abs(dx + vx) < CLEAR_X &&
    Math.abs(dy + vy) < CLEAR_Y &&
    Math.abs(dx) < CLEAR_X &&
    Math.abs(dy) < CLEAR_Y
  ) {
    // Extend to where the ray from the resting center leaves the clear zone.
    // The pushed point is inside it, so this only ever lengthens the push.
    const ux = vx / len;
    const uy = vy / len;
    const exitX =
      ux === 0 ? Infinity : ((ux > 0 ? CLEAR_X : -CLEAR_X) - dx) / ux;
    const exitY =
      uy === 0 ? Infinity : ((uy > 0 ? CLEAR_Y : -CLEAR_Y) - dy) / uy;
    const t = Math.min(exitX, exitY);
    vx = ux * t;
    vy = uy * t;
  }
  return { x: l.tx + vx, y: l.ty + vy };
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
