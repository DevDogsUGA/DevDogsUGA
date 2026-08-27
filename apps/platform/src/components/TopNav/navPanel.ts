/**
 * The card itself — the thing a viewer would point at and call the menu.
 *
 * It belongs to the VIEWPORT, not to the panels inside it, and that is the
 * whole arrangement in one line. The viewport is what moves between triggers
 * and resizes between panels; if the border and the fill live on the panels
 * instead, the viewport is an invisible box and all that movement happens to
 * nothing. What you would see is one card disappearing and a differently
 * sized one appearing somewhere else, with a very carefully animated nothing
 * in between them.
 *
 * One surface for every panel also means one surface being cross-faded rather
 * than two translucent ones stacking mid-hand-over, which would darken and
 * double-blur exactly halfway through.
 */
/*
 * An inset ring rather than a border, because a border is layout and this
 * needs not to be. The viewport is sized to the panel inside it, and the panel
 * is stretched back to the viewport; a border between them takes a pixel off
 * each edge of that round trip, so the panel ends up two pixels narrower than
 * the contents it is supposed to be holding. A ring is a shadow, occupies no
 * space, and leaves the two exactly the same box.
 */
/*
 * The fill is the navbar's, carried down onto the panels that hang off it,
 * but held further from the page behind. The bar is sixty-four pixels of
 * chrome and can afford to be seen through; a panel is half the screen, and
 * over the home page's hero the same ninety percent left the headline legible
 * straight through a menu. Denser and blurred harder is the same material,
 * thick enough to read a list off.
 */
export const NAV_SURFACE =
  "rounded-lg bg-mauve-950/95 shadow-lg ring-1 ring-mauve-800 ring-inset backdrop-blur-lg";

/**
 * How a panel sits inside the viewport that hoisted it.
 *
 * It fills it, and it clips. Filling is what makes a hand-over a cross-fade of
 * two things the same size and shape rather than of two cards; clipping is
 * what the surface's own rounded border cannot do for it, because the panels
 * are Radix's own children and there is nowhere to put a clipping wrapper
 * between them.
 *
 * The clip is load-bearing, not tidiness. A panel keeps its natural size while
 * the viewport travels between two different ones, so for the length of every
 * hand-over the outgoing panel is bigger than the box it is leaving. Unclipped
 * it hangs out past the border, and a menu with its contents spilling over the
 * edge of its own card is a worse thing to look at than the jump this replaced.
 *
 * The animation is keyed on `data-motion`, which Radix sets only when one
 * panel replaces another in an already-open viewport, and leaves off entirely
 * when the viewport opens from closed. That is the distinction we want: a
 * hand-over slides, an opening does not, because the viewport is folding in
 * around it and a second animation underneath reads as a stutter.
 *
 * The slide follows the pointer's own travel along the triggers. Radix names
 * the four cases relative to the list's order — `from-end` is the panel of an
 * item further down the list arriving, `to-start` its predecessor leaving —
 * so a menu read left to right hands over horizontally and one read top to
 * bottom hands over vertically, each in the direction the reader is moving.
 */
const PANEL = "absolute inset-0";
const CLIP = "overflow-hidden rounded-lg";

const ACROSS =
  "data-[motion=from-start]:animate-nav-content-in-left data-[motion=from-end]:animate-nav-content-in-right data-[motion=to-start]:animate-nav-content-out-left data-[motion=to-end]:animate-nav-content-out-right";

const DOWN =
  "data-[motion=from-start]:animate-nav-content-in-up data-[motion=from-end]:animate-nav-content-in-down data-[motion=to-start]:animate-nav-content-out-up data-[motion=to-end]:animate-nav-content-out-down";

export const NAV_CONTENT = `${PANEL} ${CLIP} ${ACROSS}`;

/**
 * A top-tier panel that cannot clip itself, because things it owns are
 * supposed to hang outside it: the profile menu's sub-panel, the arrow
 * pointing at it, and the band that holds the whole menu open. Those get to
 * escape, and the card's contents are clipped one level in instead.
 */
export const NAV_OPEN_CONTENT = `${PANEL} ${ACROSS}`;

/** The clip that panel does not do, wrapped around its contents alone. */
export const NAV_CLIP = `${PANEL} ${CLIP}`;

export const NAV_SUB_CONTENT = `${PANEL} ${CLIP} ${DOWN}`;

/**
 * The arrow tying a panel to the trigger it belongs to.
 *
 * A small square turned forty-five degrees, showing the two borders that meet
 * at the corner it points with, filled to match the card. The card is painted
 * over it, so only the half sticking out past its edge is ever seen — and that
 * half is a chevron. Drawing it as a rotated square rather than a triangle is
 * what lets those two visible sides carry the card's own border rather than
 * approximating it.
 */
const ARROW =
  "size-2.5 rotate-45 border-mauve-800 bg-mauve-950/90 backdrop-blur";

/** Points up, at a trigger in the bar above it. */
export const NAV_ARROW = `${ARROW} -translate-y-1/2 border-t border-l`;

/**
 * The tier-1 arrow's track.
 *
 * Radix portals the Indicator into a wrapper spanning the list and positions
 * it over whichever trigger is open, so all that is added here is the drop to
 * the panel's edge, the centring within the trigger, and the movement between
 * one trigger and the next — on the duration and easing the panel travels on,
 * so arrow and panel read as one thing moving rather than two things agreeing.
 *
 * No height, so it takes part in none of the bar's layout: it is a line to
 * hang the arrow off, and the arrow is pulled back onto it by half itself.
 *
 * It arrives and leaves on an animation rather than a transition, and that is
 * the whole point of it. Radix keeps the indicator mounted only while an
 * animation is running on it; a transition to zero opacity is not one, so it
 * was being torn out of the DOM the instant the menu closed, while the panel
 * was still a hundred and forty milliseconds from finishing its fold. The
 * arrow left, and then the panel it was pointing at left.
 */
export const NAV_ARROW_TRACK =
  "top-full mt-2 flex h-0 justify-center transition-[transform,width] duration-200 ease-out data-[state=visible]:animate-nav-arrow-in data-[state=hidden]:animate-nav-arrow-out";

/**
 * The tier-2 arrow, which is placed by hand rather than by Radix.
 *
 * Radix's Indicator portals itself into the wrapper around its tier's list,
 * and that list lives inside the card, which now clips. An arrow whose whole
 * job is to stick out past the card's edge cannot be rendered inside the thing
 * clipping at that edge. So it is a sibling of the sub-panel instead, sitting
 * on the panel's near edge, and the shell tells it which row to point at.
 *
 * Positioned from the right so it does not care how wide the sub-panel is, and
 * moved by `top` rather than a transform, because `rotate` and `translate` are
 * both already spoken for by the shape of it.
 */
export const NAV_SUB_ARROW =
  "absolute right-[calc(100%+0.5rem)] size-2.5 translate-x-1/2 -translate-y-1/2 rotate-45 border-t border-r border-mauve-800 bg-mauve-950/90 backdrop-blur [transition:top_200ms_ease-out,opacity_140ms_ease-in] data-[state=hidden]:opacity-0";
