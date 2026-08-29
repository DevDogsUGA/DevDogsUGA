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
    // Was "Open build", which became actively wrong the moment a real build
    // session existed under its own name — two labels for what a reader would
    // take to be the same night. This segment now says only what it always
    // structurally meant: no workshops, no judging, and nothing an officer
    // chose to call it. It is also now rare, since `resolveMeetingSegments`
    // suppresses it whenever a `kind` is set.
    label: "Unscheduled",
  },
};

/**
 * The badge for a night an officer NAMED, keyed by `meetings.kind`.
 *
 * A lookup with a fallback rather than a total mapping, and NOT because the
 * list is open — it is closed at four values, by `parseMeetingKind` upstream
 * and by `meetings_kind_choices` in the database, so a kind this side has
 * never heard of cannot reach here. The fallback is for the three choices that
 * are recognised and deliberately have no hue: `Study Session`, `Interest
 * Meeting` and `Social` all print themselves in the neutral pill. That is what
 * makes storing Title Case display strings rather than identifiers pay — the
 * label is the value, so a kind can be added to the list above without also
 * being given a colour.
 *
 * Only `Build Session` earns a hue, deliberately. It is MODAL — roughly half
 * the calendar, recurring every week a sprint runs — so a reader learns its
 * colour. A social happens twice a semester; a hue there is one nobody has
 * time to learn, and every hue spent makes the ones that matter less distinct.
 * Adding another is one entry here.
 *
 * Cyan, which is the one hue `segmentBadge` above does not spend: judging is
 * rose, workshop and kickoff share emerald, and `open` is amber. It is also
 * the colour `CompetitionTimeline` already draws the build week in, so the
 * chip and the illustration agree without anybody having to keep them in step.
 */
export const kindBadge: Record<string, SegmentBadge> = {
  "Build Session": {
    bg: "bg-cyan-400",
    text: "text-black",
    dot: "bg-cyan-500",
    chipDark: "border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
    dotDark: "bg-cyan-400",
    label: "Build Session",
  },
};

/** The neutral badge the three un-hued kinds print themselves in. */
function neutralKindBadge(kind: string): SegmentBadge {
  return {
    bg: "bg-white",
    text: "text-black",
    dot: "bg-mauve-400",
    chipDark: NEUTRAL_CHIP_DARK_CLS,
    dotDark: "bg-mauve-400",
    label: kind,
  };
}

/**
 * The one badge that stands for a whole night — the calendar's single dot.
 *
 * `segments[0]` alone is no longer enough. `resolveMeetingSegments` suppresses
 * `open` whenever a `kind` is set, so the segment list is *empty* for every
 * authored night, and a lookup that consulted only segments would fall through
 * to a default for a build session whose own chip is cyan: the same night in
 * two colours, in the module whose entire premise is that colour here is
 * information rather than decoration.
 *
 * Kind wins when present because it is the more specific claim. An officer
 * said what the night was; structure only ever infers.
 *
 * Returns null only when a meeting has neither — which `resolveMeetingSegments`
 * makes unreachable, since `open` is pushed exactly when both are absent. The
 * nullable return is there so a caller cannot paper over that with a default
 * colour if the invariant ever changes.
 */
export function primaryBadge(meeting: {
  kind: string | null;
  segments: readonly MeetingSegment[];
}): SegmentBadge | null {
  if (meeting.kind !== null) {
    return kindBadge[meeting.kind] ?? neutralKindBadge(meeting.kind);
  }
  const first = meeting.segments[0];
  return first === undefined ? null : segmentBadge[first];
}

/**
 * Every badge a meeting shows, derived first and authored last.
 *
 * Composed here rather than at each band because all of them do the identical
 * two steps — render the segment chips, then render the kind — and
 * `resolveMeetingSegments` no longer returns the kind alongside the segments
 * to remind them to. A band that forgot would show an authored night no chip
 * at all, since its segment list is empty by design.
 *
 * Derived first, because the segment order is already ranked by what a reader
 * needs; a kind is a modifier on the night rather than a deadline in it.
 */
export function meetingBadges(meeting: {
  kind: string | null;
  segments: readonly MeetingSegment[];
}): SegmentBadge[] {
  const badges = meeting.segments.map((segment) => segmentBadge[segment]);
  if (meeting.kind !== null) {
    badges.push(kindBadge[meeting.kind] ?? neutralKindBadge(meeting.kind));
  }
  return badges;
}

// ── Cancellation ─────────────────────────────────────────────────────────────
//
// This lives here, beside the badges, because it is the same kind of fact and
// has the same problem: every band renders it, and a band that forgets does
// not fail — it renders a night that is not happening as a night that is.
//
// ⚠️ The loaders deliberately do NOT filter cancelled rows. `getMeetingsInRange`
// and `getPastMeetings` keep them (see the note in `loaders/meetings.ts`), and
// only `getUpcomingMeetings` drops them, because the schedule's whole reason
// for keeping a cancelled night is that somebody was already told to turn up.
// The consequence is that EVERY consumer of those two loaders is responsible
// for the gate, and four of them silently were not: the calendar dot and its
// popover, the past-meetings archive, the dialog header — whose title and time
// are also the Radix accessible name and description, so a screen-reader user
// was told only when and where — and `generateMetadata`, so the Discord unfurl
// of the link people were sent still advertised the room and the hour.
//
// The predicate was also being re-derived as `meeting.cancelledAt !== null` at
// each site that did remember, which is how the count got to four: there was
// nothing to import, so there was nothing to notice the absence of.

/** The least a row has to carry for the helpers below to judge it. */
export interface CancellableMeeting {
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

/**
 * Whether the club has called this night off.
 *
 * Trivial on purpose. The value of it is not the expression, it is that there
 * is ONE of them and it is importable — a band reaching for it is a band that
 * has thought about the case.
 */
export function isCancelled(meeting: { cancelledAt: Date | null }): boolean {
  return meeting.cancelledAt !== null;
}

/**
 * The notice a cancelled night shows, or null when the night is on.
 *
 * The reason is optional even on a cancelled night — the fact and the
 * explanation arrive in separate officer keystrokes, and `checkMeeting`
 * refuses a reason that has outgrown the notice while keeping the
 * cancellation. So the fact is stated alone whenever the words are missing,
 * rather than the whole notice waiting on them.
 *
 * One string rather than a component because the callers need it in three
 * shapes: rendered as text, as an OG description, and as a Radix accessible
 * description where markup is not allowed at all.
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
 * is not a kind — a rose dot would read as judging at 4px.
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

/** The chip for a recognised kind with no hue of its own — `Study Session`,
 *  `Interest Meeting`, `Social`. Neutral because those three deliberately have
 *  no colour, NOT because the value is unknown: the list is closed at four, by
 *  `parseMeetingKind` upstream and `meetings_kind_choices` in the database. */
export const NEUTRAL_CHIP_DARK_CLS = "border-white/20 bg-white/5 text-white";

/** A bordered action — the Directions trigger, RSVP, check-in. Light plates. */
export const ACTION_CLS =
  "hover:shadow-block-md transition-lift flex w-fit items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

/** The same action in the console dialect: the gated pages' secondary button,
 *  which brightens its border instead of lifting. */
export const ACTION_DARK_CLS =
  "flex w-fit items-center gap-1.5 rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white";
