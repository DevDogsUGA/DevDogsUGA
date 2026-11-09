/**
 * The card itself, the thing a viewer would point at and call the menu.
 *
 * It belongs to the VIEWPORT, not to the panels inside it. The viewport moves
 * between triggers and resizes between panels. Put the border and fill on the
 * panels and the viewport animates nothing while one card disappears and a
 * differently sized one appears somewhere else. One surface per panel also
 * keeps the cross-fade from stacking two translucent layers, which would darken
 * and double-blur halfway through.
 */
/*
 * An inset ring rather than a border, because a border is layout and this must
 * not be. The viewport is sized to the panel inside it and the panel is
 * stretched back to the viewport, so a border between them takes a pixel off
 * each edge of that round trip and the panel ends up two pixels narrower than
 * its contents. A ring is a shadow: no space, same box.
 */
/*
 * Opaque, which the arrow forces.
 *
 * The fill used to be the navbar's, translucent and blurred, on the reasoning
 * that a panel hanging off the bar is the same material. But the arrow
 * straddles this card's edge and has to be indistinguishable from it on the
 * inside, and two translucent layers over one backdrop compound: the overlap
 * shows as a diamond. Only a fill that hides what is behind it matches.
 *
 * A 64px bar can afford to be seen through; a panel is half the screen. This
 * was already at 95% to keep the home page's hero from reading through a menu.
 * The last 5% buys a continuous outline.
 */
export const NAV_SURFACE =
  "rounded-lg bg-mauve-950 shadow-lg ring-1 ring-mauve-800 ring-inset";

/**
 * A panel fills the viewport that hoisted it, and clips.
 *
 * Filling makes a hand-over a cross-fade of two identical boxes rather than of
 * two cards. Clipping has to happen here because the panels are Radix's own
 * children and there is nowhere to put a wrapper between them and the surface.
 *
 * The clip is load-bearing. A panel keeps its natural size while the viewport
 * travels between two different ones, so during every hand-over the outgoing
 * panel is bigger than the box it is leaving and would spill past the border.
 *
 * The animation is keyed on `data-motion`, which Radix sets only when one panel
 * replaces another in an already-open viewport, never when the viewport opens
 * from closed. A hand-over slides, an opening does not: the viewport is folding
 * in around it and a second animation underneath reads as a stutter.
 *
 * Radix names the four cases relative to the list's order. `from-end` is the
 * panel of an item further down the list arriving, `to-start` its predecessor
 * leaving, so the slide follows the pointer's travel: left to right for a menu
 * read that way, top to bottom for one read down.
 */
const PANEL = "absolute inset-0";
const CLIP = "overflow-hidden rounded-lg";

const ACROSS =
  "data-[motion=from-start]:animate-nav-content-in-left data-[motion=from-end]:animate-nav-content-in-right data-[motion=to-start]:animate-nav-content-out-left data-[motion=to-end]:animate-nav-content-out-right";

const DOWN =
  "data-[motion=from-start]:animate-nav-content-in-up data-[motion=from-end]:animate-nav-content-in-down data-[motion=to-start]:animate-nav-content-out-up data-[motion=to-end]:animate-nav-content-out-down";

export const NAV_CONTENT = `${PANEL} ${CLIP} ${ACROSS}`;

/**
 * A top-tier panel that cannot clip itself, because things it owns hang outside
 * it: the profile menu's sub-panel, the arrow pointing at it, and the band that
 * holds the whole menu open. Those escape, and NAV_CLIP clips the card's
 * contents one level in instead.
 */
export const NAV_OPEN_CONTENT = `${PANEL} ${ACROSS}`;

/** The clip that panel does not do, wrapped around its contents alone. */
export const NAV_CLIP = `${PANEL} ${CLIP}`;

export const NAV_SUB_CONTENT = `${PANEL} ${CLIP} ${DOWN}`;

/*
 * The arrow tying a panel to the trigger it belongs to: a small square turned
 * 45deg, showing the two borders that meet at the corner it points with, filled
 * to match the card.
 *
 * It sits ON the card, straddling the edge, and is painted OVER it. That order
 * is the trick, and it is what this had backwards. The card's own outline runs
 * straight past underneath, so draw the card last and you get an unbroken
 * border with a separate chevron perched on it. Drawn over, the arrow's fill
 * hides the outline behind it and its own two borders carry that line up to the
 * point and back down.
 *
 * The half of the square inside the card has to be indistinguishable from the
 * card, which is why both are opaque. See NAV_SURFACE.
 */
/*
 * Placed by hand, not by Radix's Indicator, which this used to be. The
 * Indicator renders nothing until it has found and measured its trigger, and
 * it does that in a passive effect plus a ResizeObserver, a frame or two after
 * the commit that mounts the viewport. It unmounts on close, so every open
 * paid that again: the card was 50ms into its fold before the arrow's fade
 * began. The shell already measures the open trigger before paint for the
 * viewport's sake, so the arrow hangs off the same measurement and changes
 * state in the same commit as the box it points from.
 *
 * `top-2` is the viewport's top edge: the strip the viewport sits in hangs the
 * same 0.5rem below the bar. Pulled onto that edge by half of itself both
 * ways, so `left` can be the trigger's centre.
 *
 * The fade is keyed on `data-state` and runs on the fold's own numbers, 180ms
 * out on the way in and 140ms in on the way out; `opacity-0` is what holds
 * after the out animation ends, since the arrow stays mounted now. The slide
 * between triggers is gated on `data-travelling` exactly as the viewport's is,
 * so a menu opening cold never animates in from wherever the arrow last was.
 */
export const NAV_ARROW =
  "absolute top-2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-t border-l border-mauve-800 bg-mauve-950 transition-none data-[travelling]:transition-[left] data-[travelling]:duration-200 data-[travelling]:ease-out data-[state=visible]:animate-nav-arrow-in data-[state=hidden]:animate-nav-arrow-out data-[state=hidden]:opacity-0";

/**
 * The tier-2 arrow, placed by hand rather than by Radix.
 *
 * Radix's Indicator portals itself into the wrapper around its tier's list, and
 * that list lives inside the card, which now clips. An arrow whose job is to
 * stick out past the card's edge cannot be rendered inside the thing clipping
 * at that edge. So it is a sibling of the sub-panel, sitting on the panel's
 * near edge, and the shell tells it which row to point at.
 *
 * Positioned from the right so it does not care how wide the sub-panel is, and
 * moved by `top` rather than a transform, because `rotate` and `translate` are
 * both spoken for by the shape of it. Above the sub-panel, for the same reason
 * the tier-1 arrow is above its card: it has to hide the stretch of outline it
 * stands on.
 *
 * The fade takes each direction's timing from the state it is heading INTO,
 * which is how transitions resolve: 180ms ease-out arriving, to match the
 * fold-in, 140ms ease-in leaving, to match the fold-out. One 140ms ease-in
 * both ways used to sit dead through the fold-in's brisk ease-out start, so
 * the arrow read as arriving after the panel it points at. The `top` slide is
 * gated on `data-travelling` like every other movement between two open
 * panels, so an opening sub-menu gets an arrow at its row rather than one
 * sliding down from wherever the last open left it.
 */
export const NAV_SUB_ARROW =
  "absolute right-[calc(100%+0.5rem)] z-10 size-2.5 translate-x-1/2 -translate-y-1/2 rotate-45 border-t border-r border-mauve-800 bg-mauve-950 [transition:opacity_180ms_ease-out] data-[state=hidden]:[transition:opacity_140ms_ease-in] data-[state=hidden]:opacity-0 data-[travelling]:[transition:top_200ms_ease-out,opacity_180ms_ease-out]";
