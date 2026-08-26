import Link from "next/link";
import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import {
  ACTION_CLS,
  CHIP_CLS,
  segmentBadge,
} from "~/components/EventsSection/meetingView";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import { EVENT_TZ, formatEventSpan, formatRelative } from "~/lib/eventTime";
import {
  resolveMeetingSegments,
  type MeetingInRange,
  type MeetingRangeJudging,
  type MeetingRangeWorkshop,
} from "~/server/loaders/meetings";

/**
 * The upcoming nights, as a list.
 *
 * A **list**, not a grid: real semesters do not have four nights, they have
 * eleven, or three, or none in July, and a list has no opinion about how many
 * there are. And a list of **rows**, not of cards — each night is a ruled row
 * with the date down the left edge, so twelve of them read as one schedule
 * rather than twelve panels. This is the "coming up" half of the page's
 * ledger; {@link PastMeetings} is the other half, in the same rows.
 *
 * Fetches nothing. Every meeting here was already loaded by whoever renders
 * the page — the marquee above needs the same rows to pick its headline from,
 * and a second query would be the same data read twice at a different instant.
 */

interface Props {
  /** Ascending, and already missing whichever meeting the marquee took. */
  meetings: MeetingInRange[];
  /**
   * The instant the page is rendering at, passed in rather than read here.
   *
   * A `new Date()` in this tree would drop the whole route out of the static
   * shell with no build warning at all — see `docs/platform/caching.md`. It is
   * also the only way the countdown on every row can agree with the marquee's:
   * one read, threaded down, instead of a dozen reads a few milliseconds apart.
   */
  now: Date;
}

/**
 * Intl with an explicit `timeZone`, not `@date-fns/tz`: `TZDate`'s constructor
 * runs `new Date()` unconditionally, so building one is a clock read even when
 * the value it produces has nothing to do with now. `eventTime` has no
 * weekday helper to reach for — its formatters all print a full date, which is
 * exactly what this block exists to avoid repeating — so the zone comes from
 * there and the shape is spelled here.
 */
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: EVENT_TZ,
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: EVENT_TZ,
});

export default function ScheduleList({ meetings, now }: Props) {
  return (
    <section
      className="flex flex-col gap-4"
      data-animate="fade-up"
      aria-labelledby="schedule-heading"
    >
      <h3
        id="schedule-heading"
        className="font-display text-xl font-extrabold text-black md:text-2xl"
      >
        Coming up
      </h3>

      {meetings.length === 0 ? (
        <EmptySchedule />
      ) : (
        <ul className="flex flex-col divide-y-2 divide-mauve-200 border-y-2 border-black">
          {meetings.map((meeting) => (
            <ScheduleRow key={meeting.id} meeting={meeting} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Months of the year, not an error.
 *
 * This is the live state through every summer and both breaks, so it is
 * written as a status rather than an apology: nothing is scheduled, here is
 * when that changes, and here is the one place that has anything in the
 * meantime. An "unable to load events" framing would send members to Discord
 * to report a bug that is really just August.
 */
function EmptySchedule() {
  return (
    <div className="flex flex-col items-start gap-3 border-y-2 border-black py-5">
      <p className="font-display text-lg font-extrabold text-black">
        Nothing on the calendar yet
      </p>
      <p className="max-w-prose text-sm/relaxed text-mauve-700">
        The fall schedule goes up in August, once officers have the room
        bookings. Until then the Involvement Network is where anything one-off —
        a callout, an interest meeting — gets posted.
      </p>
      <a
        href={INVOLVEMENT_NETWORK_EVENTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={ACTION_CLS}
      >
        DevDogs on the Involvement Network <ArrowUpRightIcon />
      </a>
    </div>
  );
}

function ScheduleRow({ meeting, now }: { meeting: MeetingInRange; now: Date }) {
  // `kindOverride` comes back beside `segments` rather than replacing them, so
  // both are rendered. A social that also runs a workshop is a real night, and
  // a row that showed only the override would quietly drop the workshop.
  const { segments, kindOverride } = resolveMeetingSegments(meeting);

  // `endsAt`, not `startsAt`: a meeting already underway is still the thing a
  // member walking over cares about, and "started 40 minutes ago" is a worse
  // answer than saying it is on right now.
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;

  // The usual room is said once at the top of the page, so a row only earns
  // its own note when the answer is *not* the usual room. This used to be a
  // regex over the typed location, which failed closed — an unrecognised
  // string flagged a room change that might not have happened — and needed a
  // second guard to stay quiet. A picked building answers it outright, and a
  // null one still says nothing rather than guessing.
  const elsewhere = meeting.building !== null && meeting.building !== "DLW";

  return (
    <li className="relative flex gap-4 py-4 md:gap-5">
      {/*
        Hidden from assistive tech: the span below prints the same date in full,
        so announcing "Wed 10" first only makes every row take twice as long to
        hear. It is a scanning aid for eyes running down the left edge.
      */}
      <div
        aria-hidden
        className="flex w-12 shrink-0 flex-col items-center leading-none md:w-14"
      >
        <span className="font-display text-[0.625rem] font-extrabold tracking-widest text-mauve-500 uppercase">
          {WEEKDAY_FORMAT.format(meeting.startsAt)}
        </span>
        <span className="font-display text-2xl font-extrabold text-black tabular-nums md:text-3xl">
          {DAY_FORMAT.format(meeting.startsAt)}
        </span>
      </div>

      {/* `min-w-0` so a long meeting name wraps instead of forcing the row
          wider than the viewport — the phone case this band is built for. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-display text-base leading-tight font-extrabold text-black md:text-lg">
            {/*
              A stretched link, not a wrapper: the row also carries links to
              competition pages, and an <a> inside an <a> is invalid markup the
              browser silently un-nests, which breaks hydration. The pseudo
              element covers the row for the pointer while the accessible name
              stays the meeting's own, and the inner links sit above it.
            */}
            <Link
              href={`/events/${meeting.slug}`}
              className="rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              {meeting.name}
            </Link>
          </h3>
          <span className="text-xs font-semibold text-mauve-600">
            {happeningNow ? (
              "Happening now"
            ) : (
              <time dateTime={meeting.startsAt.toISOString()}>
                {formatRelative(meeting.startsAt, now)}
              </time>
            )}
          </span>
        </div>

        <p className="text-xs text-mauve-700 md:text-sm">
          {formatEventSpan(meeting.startsAt, meeting.endsAt)}
        </p>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mauve-700 md:text-sm">
          <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
          {locationLine(meeting.building, meeting.location) ??
            "Room to be announced"}
          {elsewhere && (
            <span
              className={`border-2 border-black bg-white text-black ${CHIP_CLS}`}
            >
              Not the usual room
            </span>
          )}
        </p>

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
          {/*
            Verbatim, in a neutral chip. `kind` is an Airtable single-select an
            officer can extend without touching this repository, so a value
            this side has never heard of has to render as itself — never
            switched on, which is how it would arrive here as a blank badge.
          */}
          {kindOverride !== null && (
            <span
              className={`border-2 border-black bg-white text-black ${CHIP_CLS}`}
            >
              {kindOverride}
            </span>
          )}
        </div>

        {(meeting.judgedCompetitions.length > 0 ||
          meeting.workshops.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Judging first: it is the segment with a deadline behind it, and
                the one whose competition opened weeks ago and is being closed
                tonight. Same ordering the resolver bills the night in. */}
            {meeting.judgedCompetitions.map((judging) => (
              <JudgingChip key={judging.competitionId} judging={judging} />
            ))}
            {meeting.workshops.map((workshop) => (
              <WorkshopChip key={workshop.workshopId} workshop={workshop} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** `relative` so the chip's own link paints above the row's stretched one;
 *  without it the row swallows every click meant for a competition. */
const CHIP_LINK_CLS =
  "relative z-10 underline decoration-2 underline-offset-2 hover:no-underline";

function JudgingChip({ judging }: { judging: MeetingRangeJudging }) {
  const badge = segmentBadge.judging;

  return (
    <Link
      href={`/competitions/${judging.competitionSlug}/teams`}
      className={`${badge.bg} ${badge.text} ${CHIP_CLS} ${CHIP_LINK_CLS}`}
    >
      Judging: {judging.projectName}
    </Link>
  );
}

function WorkshopChip({ workshop }: { workshop: MeetingRangeWorkshop }) {
  // A null `competitionSlug` is a *supplementary* workshop: a session complete
  // on its own, worth exactly one star, and an ordinary thing for a Wednesday.
  // So it gets a chip of the same size, weight and colour family as any other
  // workshop — no faded state, no "no competition" caveat, no empty slot where
  // a link would have been. The only difference is that it is a span rather
  // than an anchor, because there is genuinely nowhere to go. Dressing the
  // absence up as a gap would tell members a complete session was broken.
  const badge =
    workshop.competitionSlug === null
      ? segmentBadge.workshop
      : segmentBadge.kickoff;
  const chipCls = `${badge.bg} ${badge.text} ${CHIP_CLS}`;

  if (workshop.competitionSlug === null) {
    return <span className={chipCls}>{workshop.projectName}</span>;
  }

  return (
    <Link
      href={`/competitions/${workshop.competitionSlug}/teams`}
      className={`${chipCls} ${CHIP_LINK_CLS}`}
    >
      {workshop.projectName}
    </Link>
  );
}
