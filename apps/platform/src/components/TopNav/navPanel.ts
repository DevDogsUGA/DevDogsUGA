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
 * hand-over slides, an opening does not, because the viewport is folding in
 * around it and a second animation underneath reads as a stutter.
 *
 * The slide follows the pointer's own travel along the triggers. Radix names
 * the four cases relative to the list's order — `from-end` is the panel of an
 * item further down the list arriving, `to-start` its predecessor leaving —
 * so a menu read left to right hands over horizontally and one read top to
 * bottom hands over vertically, each in the direction the reader is moving.
 */
export const NAV_CONTENT = `absolute top-0 left-0 data-[motion=from-start]:animate-nav-content-in-left data-[motion=from-end]:animate-nav-content-in-right data-[motion=to-start]:animate-nav-content-out-left data-[motion=to-end]:animate-nav-content-out-right`;

/**
 * The same hand-over one tier down, where the reader moves up and down instead
 * of left and right — and where the panel hangs off the edge it is anchored
 * by, rather than the edge that moves.
 *
 * A sub-panel's viewport is pinned by its RIGHT edge, against the card, and
 * resizes by moving its left edge. A panel pinned to the left edge therefore
 * rode that resize: switching from the wide Console panel to the narrow
 * Competitions one dropped the new panel in at the old one's left edge and
 * slid it 256px right, which is a card flying across the screen to say that a
 * box behind it got smaller. Pinned right, it arrives where it belongs and the
 * only thing that moves is the size.
 *
 * `right-2` rather than `right-0` because the viewport carries the gap to the
 * card as padding, and an absolutely positioned box measures its offsets from
 * the padding box's edge — which is outside the padding, not inside it.
 *
 * `inset-y-0 my-auto` centres it without a transform. Centring with one would
 * be shorter, but `translate` is what the hand-over animations move, and they
 * would overwrite it the moment either played.
 */
export const NAV_SUB_CONTENT = `absolute inset-y-0 right-2 my-auto h-fit data-[motion=from-start]:animate-nav-content-in-up data-[motion=from-end]:animate-nav-content-in-down data-[motion=to-start]:animate-nav-content-out-up data-[motion=to-end]:animate-nav-content-out-down`;

/**
 * The arrow tying a panel to the trigger it belongs to.
 *
 * A small square turned forty-five degrees, showing the two borders that meet
 * at the corner it points with, filled to match the panel it belongs to. The
 * panel is painted over it, so only the half sticking out past the panel's
 * edge is ever seen — and that half is a chevron. Drawing it as a rotated
 * square rather than a triangle is what lets those two visible sides carry the
 * panel's own border rather than approximating it.
 *
 * The fill is the profile card's exactly. Against the opaque panels it is a
 * tenth of one shade of mauve short of theirs, over a page that is already
 * darker than either, which is a difference that does not survive being drawn.
 */
const ARROW =
  "size-2.5 rotate-45 border-mauve-800 bg-mauve-950/90 backdrop-blur";

/** Points up, at a trigger in the bar above it. */
export const NAV_ARROW = `${ARROW} -translate-y-1/2 border-t border-l`;

/** Points right, at a sub-menu trigger in the card beside it. */
export const NAV_SUB_ARROW = `${ARROW} -translate-x-1/2 border-t border-r`;

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
 * The tier-2 arrow's track, which is the same idea rotated: a vertical tier
 * moves its indicator up and down, so the arrow rides the sub-menu's triggers
 * and sits on the sub-panel's near edge, ten pixels out past the card's inner
 * edge — the card's two-pixel border plus the gap the panel keeps from it.
 */
export const NAV_SUB_ARROW_TRACK =
  "left-0 -ml-2.5 flex w-0 flex-col justify-center transition-[transform,height] duration-200 ease-out data-[state=visible]:animate-nav-arrow-in data-[state=hidden]:animate-nav-arrow-out";
