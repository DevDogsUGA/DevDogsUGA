import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import {
  EVENT_TZ,
  formatEventSpan,
  formatEventTime,
  formatRelative,
} from "~/lib/eventTime";
import {
  resolveMeetingSegments,
  type MeetingInRange,
} from "~/server/loaders/meetings";
import { meetingTitle } from "~/lib/meetingTitle";
import { CHIP_CLS, meetingBadges } from "./meetingView";

/**
 * The homepage's one line about the next meeting.
 *
 * Deliberately NOT `NextMeeting`, which is the same fact at ten times the size.
 * `/events` exists to answer "when", so its top band gives the next meeting
 * directions, RSVP, check-in and a summary. The homepage is instead making the
 * case that the club meets at all, so the date belongs here as *evidence*
 * rather than as the subject: one row deep, with a single way through.
 *
 * A card, the site's white plate with a block shadow, and the only box in the
 * section. It was briefly a ruled row, but a row on a plate full of headings
 * read as another heading.
 *
 * Like every band under `/events`, it never reads the clock. `now` arrives from
 * the caller, resolved once, and every zone-aware string goes through `Intl`
 * with an explicit `timeZone`. See {@link NextMeeting} for why that matters.
 */

interface Props {
  /** The soonest meeting that has not ended, or null between semesters. */
  meeting: MeetingInRange | null;
  /** "Now", resolved by the caller. Never read in here. */
  now: Date;
  /** The small label over the name. The homepage stacks three of these and
   *  only the first is the next meeting. */
  eyebrow?: string;
}

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
});

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  day: "numeric",
});

const ROW_CLS =
  "shadow-block-lg flex w-full max-w-2xl flex-col gap-4 rounded-sm border-2 border-black bg-white px-5 py-5 shadow-black sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-6";

const EYEBROW_CLS =
  "font-display text-xs font-extrabold tracking-widest text-mauve-600 uppercase";

/** A text link with an arrow. The one way through, and not a button. */
const ROW_LINK_CLS =
  "flex w-fit shrink-0 items-center gap-1.5 text-sm font-semibold text-black underline decoration-2 underline-offset-4 hover:no-underline";

export default function NextMeetingStrip({
  meeting,
  now,
  eyebrow = "Next meeting",
}: Props) {
  // Months at a time, every summer: a state of the club, not of the query.
  if (meeting === null) return <NothingScheduled />;

  const { segments } = resolveMeetingSegments(meeting);
  const badges = meetingBadges({ kind: meeting.kind, segments });

  // Half-open on the end, matching the rest of the page: at the instant a
  // meeting ends it is over rather than still on.
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  // The homepage is prerendered and served from cache, so `now` is baked at
  // build time and can legitimately sit past the meeting the caller still
  // considers next. Without this branch the line reads "Starts 2 hours ago".
  const ended = now >= meeting.endsAt;

  return (
    <div className={ROW_CLS} data-animate="fade-up">
      {/* `min-w-0` so a long meeting name truncates instead of refusing to
          shrink below its longest word, which is how a 390px viewport gets a
          horizontal scrollbar. */}
      <div className="flex min-w-0 items-center gap-5">
        {/* Through `Intl` with an explicit zone rather than `getDate()`, which
            answers in the *server's* zone. A 20:00 Eastern meeting is already
            tomorrow in UTC, so the number would be wrong for every evening
            meeting on a UTC host. */}
        <time
          dateTime={meeting.startsAt.toISOString()}
          className="flex w-14 shrink-0 flex-col items-center leading-none"
        >
          <span className={EYEBROW_CLS}>
            {WEEKDAY_FMT.format(meeting.startsAt)}
          </span>
          <span className="font-display text-4xl font-extrabold text-black tabular-nums">
            {DAY_FMT.format(meeting.startsAt)}
          </span>
        </time>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={EYEBROW_CLS}>{eyebrow}</p>
          {/* Never `nameOverride` bare: this is the strip's headline and most
              nights have no authored name, so `meetingTitle` derives one from
              the agenda and falls back to the date. */}
          <p className="font-display truncate text-xl font-extrabold text-black">
            {meetingTitle(meeting, meeting.workshops)}
          </p>

          <p className="text-xs text-mauve-700">
            <time dateTime={meeting.startsAt.toISOString()}>
              {formatEventSpan(meeting.startsAt, meeting.endsAt)}
            </time>
            <span className="mx-1.5" aria-hidden>
              &middot;
            </span>
            <span className="font-semibold text-black">
              {happeningNow ? (
                <>Happening now — until {formatEventTime(meeting.endsAt)}</>
              ) : ended ? (
                <>Ended {formatRelative(meeting.endsAt, now)}</>
              ) : (
                <>Starts {formatRelative(meeting.startsAt, now)}</>
              )}
            </span>
          </p>

          {/* Derived chips then the officer's kind, which renders verbatim in
              the neutral pill when it has no hue of its own. See `kindBadge`.
              This strip sits on the marketing pages' light plates, so the chips
              are solid fills with black borders rather than the console's
              translucent pills. The HUE is the part that must not change
              between the two. */}
          {badges.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {badges.map((badge) => (
                <span
                  key={badge.label}
                  className={`${badge.bg} ${badge.text} ${CHIP_CLS}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* A plain `Link`, not `RouteDialogLink`: that one exists to swap the
          leaf under the events layout so the dialog opens over a calendar that
          stays mounted. There is no calendar behind this one, so following it
          from here is an ordinary navigation to /events with the meeting's
          dialog already open. */}
      <Link href={`/events/${meeting.slug}`} className={ROW_LINK_CLS}>
        Details <ArrowRightIcon />
      </Link>
    </div>
  );
}

/**
 * Between semesters, in one row.
 *
 * Says when the schedule comes back rather than that there is nothing. "No
 * events" reads as something broken, and this is the ordinary state of the club
 * for months at a time. The full version of this argument, with the paragraph
 * explaining what a week looks like, belongs on `/events`; here it is a line
 * and a way to hear about it first.
 */
function NothingScheduled() {
  return (
    <div className={ROW_CLS} data-animate="fade-up">
      <div className="min-w-0 space-y-1.5">
        <p className={EYEBROW_CLS}>Next meeting</p>
        <p className="font-display text-xl font-extrabold text-black">
          Nothing on the calendar yet
        </p>
        <p className="text-xs text-mauve-700">
          The fall schedule lands in August. New dates hit the Involvement
          Network first.
        </p>
      </div>

      <a
        href={INVOLVEMENT_NETWORK_EVENTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={ROW_LINK_CLS}
      >
        Involvement Network <ArrowUpRightIcon />
      </a>
    </div>
  );
}
