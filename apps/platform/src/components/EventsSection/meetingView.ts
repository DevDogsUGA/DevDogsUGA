import type { MeetingSegment } from "~/server/loaders/meetings";

/**
 * How a meeting is *shown* — the one place the page decides what a segment
 * looks like and whether a location can be walked to.
 *
 * Shared rather than per-band because every band on the events page renders
 * the same facts at a different size: the marquee, the calendar dot, the
 * schedule row and the meeting dialog all say "this is a judging night", and
 * a cyan chip in one place with an amber one in another would read as two
 * different kinds of evening. Colour is information here, not decoration.
 *
 * Two dialects, one meaning. The homepage section sits on the marketing
 * pages' light plates, so its chips are solid fills with black borders; the
 * /events page speaks the console dialect — dark mauve, translucent tinted
 * chips — so every badge carries a `*Dark` variant beside the light one. The
 * HUE never changes between the two: cyan is a competition and amber is a
 * workshop on both plates, or the colour stops being information.
 *
 * Nothing in this module reads the clock or the database, so it is safe to
 * import from a client component.
 */

export interface SegmentBadge {
  /** Tailwind background utility for the chip, on a light plate. */
  bg: string;
  /** Tailwind text-colour utility that stays legible on `bg`. */
  text: string;
  /** The chip's own colour as a *dot*, which the calendar grid uses. Slightly
   *  darker than `bg` for the two that would otherwise vanish at 4px. */
  dot: string;
  /** The console version of the chip: a tinted translucent pill, the same
   *  shape the gated pages' status badges use. Pair with {@link CHIP_DARK_CLS}. */
  chipDark: string;
  /** The dot, re-picked to be visible on `bg-mauve-950` — `open`'s light dot
   *  is `mauve-800`, which is invisible two shades from the card it sits on. */
  dotDark: string;
  label: string;
}

/**
 * `judging` is rose; `workshop` and `kickoff` share emerald, because a kickoff
 * IS the end of a workshop — the same night, the same room, the same people
 * — and the timeline draws them as one dot. Rose against emerald is what
 * makes the loop legible on Monday: the rose end of last week's bar beside
 * the emerald start of this week's. `open` is amber, the one warm colour, for
 * the one night with nothing scheduled.
 */
export const segmentBadge: Record<MeetingSegment, SegmentBadge> = {
  judging: {
    bg: "bg-rose-400",
    text: "text-black",
    dot: "bg-rose-500",
    chipDark: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    dotDark: "bg-rose-400",
    label: "Judging",
  },
  kickoff: {
    bg: "bg-emerald-400",
    text: "text-black",
    dot: "bg-emerald-500",
    chipDark: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    dotDark: "bg-emerald-400",
    label: "Kickoff",
  },
  workshop: {
    bg: "bg-emerald-400",
    text: "text-black",
    dot: "bg-emerald-500",
    chipDark: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    dotDark: "bg-emerald-400",
    label: "Workshop",
  },
  open: {
    bg: "bg-amber-400",
    text: "text-black",
    dot: "bg-amber-400",
    chipDark: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    dotDark: "bg-amber-400",
    label: "Open build",
  },
};

/**
 * The legend under the calendar grid. `kickoff` is left out on purpose — it
 * shares emerald with `workshop`, so listing both would show two identical
 * swatches and imply the reader can tell them apart at a glance.
 */
export const SEGMENT_LEGEND: MeetingSegment[] = ["judging", "workshop", "open"];

/** The chip shape every light band uses, so padding and weight cannot drift. */
export const CHIP_CLS =
  "rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase";

/** The console chip shape: the gated pages' pill, bordered so a translucent
 *  fill still has an edge over whatever blob drifts underneath it. Colours
 *  come from `chipDark` (or {@link NEUTRAL_CHIP_DARK_CLS}). */
export const CHIP_DARK_CLS =
  "rounded-full border px-2.5 py-0.5 text-xs font-medium";

/** A `kindOverride`'s chip on the console plate: neutral, because the value is
 *  an Airtable single-select this side has never heard of and has no hue. */
export const NEUTRAL_CHIP_DARK_CLS = "border-white/20 bg-white/5 text-white";

/** A bordered action — the Directions trigger, RSVP, check-in. Light plates. */
export const ACTION_CLS =
  "hover:shadow-block-md transition-lift flex w-fit items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

/** The same action in the console dialect: the gated pages' secondary button,
 *  which brightens its border instead of lifting. */
export const ACTION_DARK_CLS =
  "flex w-fit items-center gap-1.5 rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white";
