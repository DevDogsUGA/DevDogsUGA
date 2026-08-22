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
 * Nothing in this module reads the clock or the database, so it is safe to
 * import from a client component.
 */

export interface SegmentBadge {
  /** Tailwind background utility for the chip. */
  bg: string;
  /** Tailwind text-colour utility that stays legible on `bg`. */
  text: string;
  /** The chip's own colour as a *dot*, which the calendar grid uses. Slightly
   *  darker than `bg` for the two that would otherwise vanish at 4px. */
  dot: string;
  label: string;
}

/**
 * `judging` and `kickoff` deliberately share the competition colour: they are
 * the two ends of one competition — the night it opens and the night it is
 * presented — so the *label* separates them and the hue ties them together.
 *
 * `open` takes the build-session colour, which is what an open night is.
 */
export const segmentBadge: Record<MeetingSegment, SegmentBadge> = {
  judging: {
    bg: "bg-cyan-400",
    text: "text-black",
    dot: "bg-cyan-500",
    label: "Judging",
  },
  kickoff: {
    bg: "bg-cyan-400",
    text: "text-black",
    dot: "bg-cyan-500",
    label: "Kickoff",
  },
  workshop: {
    bg: "bg-amber-400",
    text: "text-black",
    dot: "bg-amber-400",
    label: "Workshop",
  },
  open: {
    bg: "bg-mauve-800",
    text: "text-white",
    dot: "bg-mauve-800",
    label: "Open build",
  },
};

/**
 * The legend under the calendar grid, in the segment order the resolver
 * returns. `kickoff` is left out on purpose — it shares a colour with
 * `judging`, so a legend listing both would show two identical swatches and
 * imply the reader can tell them apart at a glance, which they cannot.
 */
export const SEGMENT_LEGEND: MeetingSegment[] = ["judging", "workshop", "open"];

/** The chip shape every band uses, so padding and weight cannot drift. */
export const CHIP_CLS =
  "rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase";

/** A bordered action — the Directions trigger, RSVP, check-in. */
export const ACTION_CLS =
  "hover:shadow-block-md transition-lift flex w-fit items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

/**
 * Whether `location` names the DLW, the one building this site can draw.
 *
 * The location is free text an officer typed into Airtable, so this matches
 * loosely: "DLW 124", "dlw", "Dining, Learning & Well-Being 124". It
 * deliberately does NOT try to be clever about anything else — every
 * unrecognised location falls through to plain text, because a Directions
 * button that walks somebody to the wrong building is far worse than one that
 * makes them read an address. Failing closed is the whole design.
 *
 * Word-bounded rather than a substring test, so "middlware" in a note cannot
 * trip it. "DLW124" written without the space fails and prints as text, which
 * is the safe direction to be wrong in.
 */
const DLW_PATTERNS = [/\bdlw\b/i, /\bdining,?\s+learning\b/i];

export function isAtDlw(location: string | null): boolean {
  if (location === null) return false;
  return DLW_PATTERNS.some((pattern) => pattern.test(location));
}
