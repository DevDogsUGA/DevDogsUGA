import Link from "next/link";
import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import {
  ACTION_DARK_CLS,
  CHIP_DARK_CLS,
  meetingBadges,
  NEUTRAL_CHIP_DARK_CLS,
  segmentBadge,
} from "~/components/EventsSection/meetingView";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import { EVENT_TZ, formatEventSpan, formatRelative } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
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
 * there are. Each night is a console tile — the same bordered translucent row
 * the audit log uses — with the date down the left edge, so twelve of them
 * read as one schedule. This is the "coming up" half of the page's ledger;
 * {@link PastMeetings} is the other half, as a table.
 *
 * Fetches nothing. Every meeting here was already loaded by whoever renders
 * the page — the calendar beside it draws the same rows, and a second query
 * would be the same data read twice at a different instant.
 */

interface Props {
  /** Ascending. The first one is the next meeting; there is no separate
   *  band for it any more, so this list is where it lives. */
  meetings: MeetingInRange[];
  /**
   * The instant the page is rendering at, passed in rather than read here.
   *
   * A `new Date()` in this tree would drop the whole route out of the static
   * shell with no build warning at all — see `docs/platform/caching.md`. It is
   * also the only way the countdown on every row can agree with the calendar's
   * "today": one read, threaded down, instead of a dozen a few ms apart.
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
    <section className="flex flex-col gap-4" aria-labelledby="schedule-heading">
      <h3
        id="schedule-heading"
        className="font-display text-xl font-extrabold text-white md:text-2xl"
      >
        Coming up
      </h3>

      {meetings.length === 0 ? (
        <EmptySchedule />
      ) : (
        // The console's list idiom: a stack of bordered tiles, like the audit
        // log's rows, rather than the ruled ledger the light dialect draws.
        <ul className="flex flex-col gap-2">
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
    // The console's empty state: a dashed well, like an empty credentials
    // list, rather than an apology.
    <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-mauve-700 bg-white/5 px-5 py-6">
      <p className="font-display text-lg font-extrabold text-white">
        Nothing on the books yet
      </p>
      <p className="max-w-prose text-sm/relaxed text-mauve-300">
        The fall schedule lands in August. Until then, anything one-off shows up
        on the Involvement Network first.
      </p>
      <a
        href={INVOLVEMENT_NETWORK_EVENTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={ACTION_DARK_CLS}
      >
        DevDogs on the Involvement Network <ArrowUpRightIcon />
      </a>
    </div>
  );
}

function ScheduleRow({ meeting, now }: { meeting: MeetingInRange; now: Date }) {
  // Derived chips and the officer's kind, composed together. Both are shown:
  // a social that also runs a workshop is a real night, and a row that printed
  // only the kind would quietly drop the workshop. `segments` is empty for a
  // night an officer named, so rendering it alone would show no chip at all.
  const { segments } = resolveMeetingSegments(meeting);
  const badges = meetingBadges({ kind: meeting.kind, segments });

  // `endsAt`, not `startsAt`: a meeting already underway is still the thing a
  // member walking over cares about, and "started 40 minutes ago" is a worse
  // answer than saying it is on right now.
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;

  // Every row prints its room, but only one *not* in the usual room earns a
  // chip saying so, which is how a room change stands out. This used to be a
  // regex over the typed location, which failed closed — an unrecognised
  // string flagged a room change that might not have happened — and needed a
  // second guard to stay quiet. A picked building answers it outright, and a
  // null one still says nothing rather than guessing.
  const elsewhere = meeting.building !== null && meeting.building !== "DLW";

  return (
    <li className="relative flex gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-4 md:gap-5">
      {/*
        Hidden from assistive tech: the span below prints the same date in full,
        so announcing "Wed 10" first only makes every row take twice as long to
        hear. It is a scanning aid for eyes running down the left edge.
      */}
      <div
        aria-hidden
        className="flex w-12 shrink-0 flex-col items-center leading-none md:w-14"
      >
        <span className="font-display text-[0.625rem] font-extrabold tracking-widest text-mauve-400 uppercase">
          {WEEKDAY_FORMAT.format(meeting.startsAt)}
        </span>
        <span className="font-display text-2xl font-extrabold text-white tabular-nums md:text-3xl">
          {DAY_FORMAT.format(meeting.startsAt)}
        </span>
      </div>

      {/* `min-w-0` so a long meeting name wraps instead of forcing the row
          wider than the viewport — the phone case this band is built for. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-display text-base leading-tight font-extrabold text-white md:text-lg">
            {/*
              A stretched link, not a wrapper: the row also carries links to
              competition pages, and an <a> inside an <a> is invalid markup the
              browser silently un-nests, which breaks hydration. The pseudo
              element covers the row for the pointer while the accessible name
              stays the meeting's own, and the inner links sit above it.
            */}
            {/*
              `meetingTitle`, not `nameOverride` directly: this heading is the
              row's whole click target and its accessible name, so it can never
              be empty — and `nameOverride` is null for most nights now.

              What it derives is deliberately not a restatement of the chips
              below. They say a night taught something; this says *what* —
              "Workshop: Next.js & Flutter". Only when there is neither a name
              nor an agenda does it fall back to the date, which the span
              beneath then repeats in full; that is the one redundant case and
              it is the rarest.
            */}
            <Link
              href={`/events/${meeting.slug}`}
              className="rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {meetingTitle(meeting, meeting.workshops)}
            </Link>
          </h3>
          <span className="text-xs font-semibold text-mauve-400">
            {happeningNow ? (
              "Happening now"
            ) : (
              <time dateTime={meeting.startsAt.toISOString()}>
                {formatRelative(meeting.startsAt, now)}
              </time>
            )}
          </span>
        </div>

        <p className="text-xs text-mauve-300 md:text-sm">
          {formatEventSpan(meeting.startsAt, meeting.endsAt)}
        </p>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mauve-300 md:text-sm">
          <MapPinIcon className="shrink-0 text-mauve-400" weight="fill" />
          {locationLine(meeting.building, meeting.location) ??
            "Room to be announced"}
          {elsewhere && (
            <span className={`${NEUTRAL_CHIP_DARK_CLS} ${CHIP_DARK_CLS}`}>
              Not the usual room
            </span>
          )}
        </p>

        {/*
          Derived chips then the officer's kind, composed by `meetingBadges`.
          An unrecognised kind still renders — verbatim, in the neutral pill —
          because `kind` is an Airtable single-select an officer can extend
          without touching this repository, and a value this side has never
          heard of must never arrive as a blank badge.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`${badge.chipDark} ${CHIP_DARK_CLS}`}
            >
              {badge.label}
            </span>
          ))}
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
      className={`${badge.chipDark} ${CHIP_DARK_CLS} ${CHIP_LINK_CLS}`}
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
  const chipCls = `${badge.chipDark} ${CHIP_DARK_CLS}`;

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
