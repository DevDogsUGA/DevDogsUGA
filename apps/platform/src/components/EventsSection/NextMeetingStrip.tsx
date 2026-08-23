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
import { CHIP_CLS, segmentBadge } from "./meetingView";

/**
 * The homepage's one line about the next meeting.
 *
 * Deliberately NOT `Marquee`, which is the same fact at ten times the size.
 * The two pages have different jobs and should not look like each other doing
 * them: `/events` exists to answer "when", so its top band is a card at the
 * scale of the only thing anybody came for, with directions, RSVP, check-in
 * and a summary. The homepage is not answering that question — it is making
 * the case that the club meets at all — so the date belongs here as *evidence*
 * rather than as the subject, one row deep, with a single way through.
 *
 * The inversion is the point. Every other band on the homepage's events
 * section sits on the rose plate in a white card; this one is black, so it
 * reads as a notice pinned to the section rather than as its content.
 *
 * Like every band under `/events`, it never reads the clock — `now` arrives
 * from the caller, resolved once — and every zone-aware string goes through
 * `Intl` with an explicit `timeZone`. See {@link Marquee} for why that matters
 * more than it looks like it should.
 */

interface Props {
  /** The soonest meeting that has not ended, or null between semesters. */
  meeting: MeetingInRange | null;
  /** "Now", resolved by the caller. Never read in here. */
  now: Date;
}

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
});

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  day: "numeric",
});

/**
 * White on black, the inverse of the actions everywhere else on the page —
 * because everywhere else is on the rose plate and this sits on the notice.
 */
const STRIP_ACTION_CLS =
  "hover:shadow-block-md transition-lift flex w-fit shrink-0 items-center gap-2 rounded-sm border-2 border-white bg-black px-4 py-2 text-sm font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-white/40";

const STRIP_CLS =
  "shadow-block-md flex flex-col gap-4 rounded-sm border-2 border-black bg-black p-5 shadow-black sm:flex-row sm:items-center sm:justify-between sm:gap-6";

export default function NextMeetingStrip({ meeting, now }: Props) {
  // Months at a time, every summer — a state of the club, not of the query.
  if (meeting === null) return <NothingScheduled />;

  const { segments, kindOverride } = resolveMeetingSegments(meeting);

  // Half-open on the end, matching the rest of the page: at the instant a
  // meeting ends it is over rather than still on.
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  // The homepage is prerendered and served from cache, so `now` is baked at
  // build time and can legitimately sit past the meeting the caller still
  // considers next. Without this branch the line reads "Starts 2 hours ago".
  const ended = now >= meeting.endsAt;

  return (
    <div className={STRIP_CLS} data-animate="fade-up">
      {/* `min-w-0` so a long meeting name truncates instead of refusing to
          shrink below its longest word, which is how a 390px viewport gets a
          horizontal scrollbar. */}
      <div className="flex min-w-0 items-center gap-4">
        {/* Through `Intl` with an explicit zone rather than `getDate()`, which
            answers in the *server's* zone — and a 20:00 Eastern meeting is
            already tomorrow in UTC, so the number would be wrong for every
            evening meeting on a UTC host. */}
        <time
          dateTime={meeting.startsAt.toISOString()}
          className="flex w-12 shrink-0 flex-col items-center leading-none"
        >
          <span className="font-display text-xs font-extrabold tracking-widest text-mauve-400 uppercase">
            {WEEKDAY_FMT.format(meeting.startsAt)}
          </span>
          <span className="font-display text-3xl font-extrabold text-white tabular-nums">
            {DAY_FMT.format(meeting.startsAt)}
          </span>
        </time>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-display truncate text-lg font-extrabold text-white">
            {meeting.name}
          </p>

          <p className="text-xs text-mauve-300">
            <time dateTime={meeting.startsAt.toISOString()}>
              {formatEventSpan(meeting.startsAt, meeting.endsAt)}
            </time>
            <span className="mx-1.5" aria-hidden>
              &middot;
            </span>
            <span className="font-semibold text-white">
              {happeningNow ? (
                <>Happening now — until {formatEventTime(meeting.endsAt)}</>
              ) : ended ? (
                <>Ended {formatRelative(meeting.endsAt, now)}</>
              ) : (
                <>Starts {formatRelative(meeting.startsAt, now)}</>
              )}
            </span>
          </p>

          {(segments.length > 0 || kindOverride !== null) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {segments.map((segment) => {
                const badge = segmentBadge[segment];
                return (
                  <span
                    key={segment}
                    className={`${badge.bg} ${badge.text} ${CHIP_CLS}`}
                  >
                    {badge.label}
                  </span>
                );
              })}
              {/* Verbatim. `kind` is an Airtable single-select an officer can
                  extend without touching this repo, so a value this side has
                  never heard of renders as itself. */}
              {kindOverride !== null && (
                <span
                  className={`border-2 border-white bg-black text-white ${CHIP_CLS}`}
                >
                  {kindOverride}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* A plain `Link`, not `RouteDialogLink`: that one exists to swap the
          leaf under the events layout so the dialog opens over a calendar that
          stays mounted. There is no calendar behind this one, so following it
          from here is an ordinary navigation to /events with the meeting's
          dialog already open — which is exactly what somebody clicking a date
          on the homepage wants. */}
      <Link href={`/events/${meeting.slug}`} className={STRIP_ACTION_CLS}>
        Details <ArrowRightIcon />
      </Link>
    </div>
  );
}

/**
 * Between semesters, in one row.
 *
 * Says when the schedule comes back rather than that there is nothing — "no
 * events" reads as something broken, and this is the ordinary state of the
 * club for months at a time. The full version of this argument, with the
 * paragraph explaining what a week looks like, belongs on `/events`; here it
 * is a line and a way to hear about it first.
 */
function NothingScheduled() {
  return (
    <div className={STRIP_CLS} data-animate="fade-up">
      <div className="min-w-0 space-y-1">
        <p className="font-display text-lg font-extrabold text-white">
          Nothing on the calendar yet
        </p>
        <p className="text-xs text-mauve-300">
          The fall schedule goes up in August. The Involvement Network is where
          RSVPs live, so it is the first place a new date shows up.
        </p>
      </div>

      <a
        href={INVOLVEMENT_NETWORK_EVENTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={STRIP_ACTION_CLS}
      >
        Involvement Network <ArrowUpRightIcon />
      </a>
    </div>
  );
}
