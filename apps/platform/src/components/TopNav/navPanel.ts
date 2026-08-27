/**
 * How a panel sits inside the viewport that hoisted it.
 *
 * Absolute, so that during a hand-over the outgoing panel and the incoming one
 * occupy the same corner instead of stacking and shoving the box to twice its
 * height. Pinned to the LEFT because the viewport's own left edge is what
 * moves when it resizes: a panel that grows leftward — the profile menu
 * opening a sub-menu — grows by the same amount its viewport does, so pinning
 * both to the same edge is what holds the right-hand card still.
 *
 * The animation is keyed on `data-motion`, which Radix sets only when one
 * panel replaces another in an already-open viewport, and leaves off entirely
 * when the viewport opens from closed. That is the distinction we want: a
 * hand-over cross-fades, an opening does not, because the viewport is folding
 * in around it and a second animation underneath reads as a stutter.
 */
export const NAV_CONTENT =
  "absolute top-0 left-0 data-[motion=from-end]:animate-nav-content-in data-[motion=from-start]:animate-nav-content-in data-[motion=to-end]:animate-nav-content-out data-[motion=to-start]:animate-nav-content-out";
