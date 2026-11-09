import type { MeetingSegment } from "~/lib/meetingSegments";
import {
  EVENT_CATEGORY_VISUALS,
  EVENT_SEGMENT_VISUALS,
} from "@devdogsuga/sdk/brand/event";
import { categoryOf, type EventCategory } from "~/lib/eventKind";

/**
 * How a meeting is *shown*. The one place the page decides what a segment
 * looks like.
 *
 * Shared rather than per-band because every band on the events page renders
 * the same facts at a different size: the marquee, the calendar dot, the
 * schedule row and the meeting dialog all say "this is a workshop night". One
 * hue here and another there would read as two kinds of evening. Colour is
 * information, not decoration.
 *
 * Two dialects, one meaning. The homepage section sits on the marketing
 * pages' light plates, so its chips are solid fills with black borders. The
 * /events page uses the console dialect, dark mauve with translucent tinted
 * chips, so every badge carries a `*Dark` variant beside the light one. The
 * HUE never changes between the two: a workshop night is emerald on both
 * plates, or the colour stops being information.
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
  /** The dot, re-picked to be visible on `bg-mauve-950`. `open`'s light dot is
   *  `mauve-800`, invisible two shades from the card it sits on. */
  dotDark: string;
  label: string;
}

/**
 * `workshop` is emerald, `open` is amber, the one warm colour, for the one
 * night with nothing scheduled. See `EVENT_SEGMENT_VISUALS`'s own doc
 * comment for why there are only two segments.
 */
export const segmentBadge: Record<MeetingSegment, SegmentBadge> =
  Object.fromEntries(
    Object.entries(EVENT_SEGMENT_VISUALS).map(([segment, visual]) => [
      segment,
      { ...visual, text: "text-black" },
    ]),
  ) as unknown as Record<MeetingSegment, SegmentBadge>;

/**
 * The badge for each event category (`build`, `workshop`, `social`, `info`,
 * `study`, `milestone`), which replaced the authored `kind` after the baseline.
 * Same hues as the baseline's kinds, shared with generated event art through
 * `EVENT_CATEGORY_VISUALS`.
 */
export const categoryBadge: Record<EventCategory, SegmentBadge> =
  Object.fromEntries(
    Object.entries(EVENT_CATEGORY_VISUALS).map(([category, visual]) => [
      category,
      { ...visual, text: "text-black" },
    ]),
  ) as unknown as Record<EventCategory, SegmentBadge>;

/**
 * Tailwind generates only the classes it finds spelled out in this app's own
 * sources, and the category hues live in `@devdogsuga/sdk`, a dependency it
 * does not scan. The sky, violet and indigo ones appear nowhere else in the
 * app, so a Build, Info Session or Milestone chip would render with no colour.
 * Spelling them here puts them in the stylesheet.
 */
export const CATEGORY_CLASSES = [
  "bg-sky-400 bg-sky-500/10 border-sky-400/30 text-sky-300 bg-sky-500",
  "bg-violet-400 bg-violet-500/10 border-violet-400/30 text-violet-300 bg-violet-500",
  "bg-indigo-400 bg-indigo-500/10 border-indigo-400/30 text-indigo-300 bg-indigo-500",
];

/**
 * The one badge for a whole night, which the calendar draws as its single dot.
 * A night's category is always known (`categoryOf` reads null as a build
 * night), so unlike the baseline's authored kind this never returns null.
 */
export function primaryBadge(meeting: {
  category: string | null;
  segments: readonly MeetingSegment[];
}): SegmentBadge {
  return categoryBadge[categoryOf(meeting)];
}

/**
 * Every badge a meeting shows: derived segment chips first, then the night's
 * category. A workshop night would otherwise print "Workshop" twice, so a
 * category chip whose label a segment chip already carries is dropped.
 */
export function meetingBadges(meeting: {
  category: string | null;
  segments?: readonly MeetingSegment[];
}): SegmentBadge[] {
  const badges = (meeting.segments ?? []).map(
    (segment) => segmentBadge[segment],
  );
  const category = categoryBadge[categoryOf(meeting)];
  if (!badges.some((badge) => badge.label === category.label)) {
    badges.push(category);
  }
  return badges;
}

// ── Cancellation ─────────────────────────────────────────────────────────────
//
// This lives beside the badges because it has the same problem: every band
// renders it, and a band that forgets does not fail. It renders a night that
// is not happening as a night that is.
//
// ⚠️ The loaders deliberately do NOT filter cancelled rows. `getMeetingsInRange`
// and `getPastMeetings` keep them (see the note in `loaders/meetings.ts`), and
// only `getUpcomingMeetings` drops them, because the schedule keeps a cancelled
// night for the people who were already told to turn up. So EVERY consumer of
// those two loaders is responsible for the gate, and four silently were not:
// the calendar dot and its popover, the past-meetings archive, the dialog
// header, whose title and time are also the Radix accessible name and
// description, so a screen-reader user was told only when and where, and
// `generateMetadata`, so the Discord unfurl of the link people were sent still
// advertised the room and the hour.
//
// The predicate was also re-derived as `meeting.cancelledAt !== null` at each
// site that did remember, which is how the count got to four: there was nothing
// to import, so nothing to notice the absence of.

/** The least a row has to carry for the helpers below to judge it. */
export interface CancellableMeeting {
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

/**
 * Whether the club has called this night off.
 *
 * Trivial on purpose. The value is not the expression, it is that there is ONE
 * of them and it is importable.
 */
export function isCancelled(meeting: { cancelledAt: Date | null }): boolean {
  return meeting.cancelledAt !== null;
}

/**
 * The notice a cancelled night shows, or null when the night is on.
 *
 * The reason is optional even on a cancelled night. The fact and the
 * explanation arrive in separate officer keystrokes, and `checkMeeting`
 * refuses a reason that has outgrown the notice while keeping the
 * cancellation. So the fact is stated alone when the words are missing,
 * rather than the whole notice waiting on them.
 *
 * One string rather than a component because callers need it in three shapes:
 * as text, as an OG description, and as a Radix accessible description, where
 * markup is not allowed at all.
 */
export function cancellationNotice(meeting: CancellableMeeting): string | null {
  if (!isCancelled(meeting)) return null;
  return meeting.cancellationReason === null
    ? CANCELLED_LABEL
    : `${CANCELLED_LABEL} — ${meeting.cancellationReason}`;
}

/**
 * The word itself, so the schedule chip, the dialog notice and the unfurl
 * cannot drift into three spellings of one status.
 */
export const CANCELLED_LABEL = "Cancelled";

/**
 * A cancelled night's dot, keeping the shape and losing the claim.
 *
 * Grey rather than absent: the square still has a meeting on it, and removing
 * the dot would say the club had nothing planned that day, which is a
 * different and equally wrong thing. Neutral rather than rose because the
 * calendar's hues are a legend of what KIND of night it is, and "cancelled"
 * is not a kind. A rose dot would read as judging at 4px.
 */
export function cancelledBadge(label: string): SegmentBadge {
  return {
    bg: "bg-mauve-300",
    text: "text-black",
    dot: "bg-mauve-400",
    chipDark: "border-white/20 bg-white/5 text-mauve-300 line-through",
    dotDark: "bg-mauve-600",
    label,
  };
}

/** The chip shape every light band uses, so padding and weight cannot drift. */
export const CHIP_CLS =
  "rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide uppercase";

/** The console chip shape: the gated pages' pill, bordered so a translucent
 *  fill still has an edge over whatever blob drifts underneath it. Colours
 *  come from `chipDark` (or {@link NEUTRAL_CHIP_DARK_CLS}). */
export const CHIP_DARK_CLS =
  "rounded-full border px-2.5 py-0.5 text-xs font-medium";

/** Defensive neutral chip for data outside the closed kind vocabulary. */
export const NEUTRAL_CHIP_DARK_CLS = "border-white/20 bg-white/5 text-white";

/** A bordered action: the Directions trigger, RSVP, check-in. Light plates. */
export const ACTION_CLS =
  "hover:shadow-block-md transition-lift flex w-fit items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

/** The same action in the console dialect: the gated pages' secondary button,
 *  which brightens its border instead of lifting. */
export const ACTION_DARK_CLS =
  "flex w-fit items-center gap-1.5 rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white";

/** The high-attention action on a dark event dialog. */
export const ACTION_PRIMARY_DARK_CLS =
  "flex w-fit items-center gap-1.5 rounded-lg border border-white bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-transparent hover:text-white";
