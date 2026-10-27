import {
  categoryOf,
  CATEGORY_LABEL,
  type EventCategory,
} from "~/lib/eventKind";
import { EVENT_TZ } from "~/lib/eventTime";

/**
 * How a meeting is *shown*. The one place the page decides what a night is
 * called and whether it is on.
 *
 * Colour is a category (`data-kind`, D12), never a per-surface choice: the
 * chip, the date tile, the calendar pill and the page head of one meeting all
 * read the same {@link meetingCategory}, so a workshop night is the same hue
 * everywhere or the colour stops being information.
 *
 * Nothing in this module reads the clock or the database, so it is safe to
 * import from a client component.
 */

export { CATEGORY_LABEL };

/**
 * The category a meeting is drawn in: the resolved `category` the config
 * authored for it (`categoryOf`).
 */
export function meetingCategory(meeting: {
  category: string | null;
}): EventCategory {
  return categoryOf({ category: meeting.category });
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

// ── Compact time ────────────────────────────────────────────────────────────

const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** Splits "6:30 PM" into its clock and meridiem, dropping ":00". */
function clockParts(at: Date): { clock: string; meridiem: string } {
  const [clock = "", meridiem = ""] = CLOCK.format(at).split(/\s+/);
  return { clock: clock.replace(/:00$/, ""), meridiem };
}

/** "6 PM" or "6:30 PM": the pill's time. */
export function shortTime(at: Date): string {
  const { clock, meridiem } = clockParts(at);
  return `${clock} ${meridiem}`;
}

/** "6–8 PM", or "11 AM–1 PM" when the span crosses noon. */
export function timeRange(startsAt: Date, endsAt: Date): string {
  const a = clockParts(startsAt);
  const b = clockParts(endsAt);
  return a.meridiem === b.meridiem
    ? `${a.clock}–${b.clock} ${b.meridiem}`
    : `${a.clock} ${a.meridiem}–${b.clock} ${b.meridiem}`;
}
