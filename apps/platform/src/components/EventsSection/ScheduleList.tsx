"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import {
  ACTION_DARK_CLS,
  CANCELLED_LABEL,
  CHIP_DARK_CLS,
  meetingBadges,
  NEUTRAL_CHIP_DARK_CLS,
  segmentBadge,
} from "~/components/EventsSection/meetingView";
import type { SegmentBadge } from "~/components/EventsSection/meetingView";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import {
  clubDateKey,
  clubDay,
  EVENT_TZ,
  formatEventSpan,
  formatRelative,
} from "~/lib/eventTime";
import { meetingTitle, workshopLabel } from "~/lib/meetingTitle";
// `resolveMeetingSegments` as a VALUE comes from `~/lib/meetingSegments`, not
// from the loader that re-exports it: the loader imports `~/server/db`, whose
// entry point runs `createDb(env.DB_URL, …)` at module scope, so importing the
// value through it from a client component pulls the database module into the
// browser graph, where t3-env throws on `env.DB_URL` during HYDRATION, not SSR.
// The server render looks perfect and it breaks only in a visitor's console. The
// types below are erased and were never the problem.
import { resolveMeetingSegments } from "~/lib/meetingSegments";
import type {
  MeetingInRange,
  MeetingRangeJudging,
  MeetingRangeWorkshop,
} from "~/server/loaders/meetings";

/**
 * The upcoming nights, as a list.
 *
 * A **list**, not a grid: real semesters have eleven nights, or three, or none
 * in July, and a list has no opinion about how many there are. Each night is a
 * console tile, the same bordered translucent row the audit log uses, with the
 * date down the left edge. This is the "coming up" half of the page's ledger;
 * {@link PastMeetings} is the other half, as a table.
 *
 * Fetches nothing. Every meeting here was already loaded by whoever renders the
 * page: the calendar beside it draws the same rows, and a second query would be
 * the same data read twice at a different instant.
 */

interface Props {
  /** Ascending. The first one is the next meeting; there is no separate
   *  band for it any more, so this list is where it lives. */
  meetings: MeetingInRange[];
  /**
   * The instant the page is rendering at, passed in rather than read here.
   *
   * A `new Date()` in this tree would drop the whole route out of the static
   * shell with no build warning; see `docs/monorepo/stack/nextjs.md`. It is also
   * the only way the countdown on every row agrees with the calendar's "today":
   * one read, threaded down, instead of a dozen a few ms apart.
   */
  now: Date;
  onVisibleMeetingChange?: (meetingId: string | null) => void;
  onHighlightedMeetingChange?: (meetingId: string | null) => void;
}

/**
 * Intl with an explicit `timeZone`, not `@date-fns/tz`: `TZDate`'s constructor
 * runs `new Date()` unconditionally, so building one is a clock read even when
 * the value it produces has nothing to do with now. `eventTime` has no weekday
 * helper, since its formatters all print a full date, so the zone comes from
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

/**
 * One week of the schedule, as the reader experiences it.
 *
 * The week is the club's real unit: the Wednesday build session exists *because*
 * of the Monday's sprint, and `CompetitionTimeline` has always drawn the format
 * that way. It also pays for itself once there are two nights most weeks: twice
 * the rows, half as many headings.
 *
 * Keyed on the ISO date of the week's Monday in the club's zone. Never
 * `getDay()`: a Monday 18:00 Athens meeting is Tuesday in UTC, so the ambient
 * zone files it in the *next* week, and files it differently during SSR than
 * during hydration, which is a wrong answer and a hydration mismatch at once.
 */
function weekKey(at: Date): string {
  const { year, month, day } = clubDay(at);
  // Built in UTC deliberately: this is calendar arithmetic on parts that have
  // already been resolved in `EVENT_TZ`, so the zone is spent and using UTC
  // keeps the subtraction from crossing a DST boundary and losing an hour.
  const noon = new Date(Date.UTC(year, month, day, 12));
  // getUTCDay: 0 is Sunday, and the club's week starts on Monday.
  const offset = (noon.getUTCDay() + 6) % 7;
  noon.setUTCDate(noon.getUTCDate() - offset);
  return clubDateKey(noon);
}

const WEEK_OF_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** "Week of September 21", from a `YYYY-MM-DD` key. */
function weekLabel(key: string): string {
  // Parsed as UTC noon rather than `new Date(key)`, which reads a bare
  // `YYYY-MM-DD` as midnight UTC and would print the day before for any
  // formatter west of Greenwich.
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return `Week of ${WEEK_OF_FORMAT.format(new Date(Date.UTC(y, m - 1, d, 12)))}`;
}

/**
 * The filters offered, derived from what is actually in the list.
 *
 * A fixed set of chips would offer "Build Session" in a summer with none, and a
 * filter for a kind nothing on screen has returns an empty list. Derived from
 * the rows in hand, it offers exactly what is there.
 *
 * NOT because `kind` is open-ended. It is closed at four values, by
 * `parseMeetingKind` upstream and `meetings_kind_choices` in the database. This
 * comment used to say otherwise; the reason is availability, not open-endedness.
 */
function availableFilters(meetings: MeetingInRange[]): SegmentBadge[] {
  const filters = new Map<string, SegmentBadge>();
  for (const meeting of meetings) {
    const { segments } = resolveMeetingSegments(meeting);
    for (const badge of meetingBadges({ kind: meeting.kind, segments })) {
      if (!filters.has(badge.label)) filters.set(badge.label, badge);
    }
  }
  return [...filters.values()];
}

export default function ScheduleList({
  meetings,
  now,
  onVisibleMeetingChange,
  onHighlightedMeetingChange,
}: Props) {
  const [active, setActive] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filters = availableFilters(meetings);
  // Filter FIRST, then group. The order is the whole implementation of "an
  // emptied week shows no heading": a week whose every night was filtered out
  // never becomes a group, so there is nothing to render a heading for.
  const shown =
    active === null
      ? meetings
      : meetings.filter((meeting) => {
          const { segments } = resolveMeetingSegments(meeting);
          return meetingBadges({ kind: meeting.kind, segments }).some(
            (badge) => badge.label === active,
          );
        });

  const weeks: { key: string; meetings: MeetingInRange[] }[] = [];
  for (const meeting of shown) {
    const key = weekKey(meeting.startsAt);
    const last = weeks[weeks.length - 1];
    // `meetings` arrives ascending, so a run of the same key is contiguous and
    // this never has to look further back than one group.
    if (last?.key === key) last.meetings.push(meeting);
    else weeks.push({ key, meetings: [meeting] });
  }

  useEffect(() => {
    const root = listRef.current;
    if (!root || !onVisibleMeetingChange) return;

    const rows = [...root.querySelectorAll<HTMLElement>("[data-meeting-id]")];
    const visibleRows = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleRows.add(entry.target);
          else visibleRows.delete(entry.target);
        }
        // Entries only contains rows whose intersection changed. Retain the
        // full set so the next row takes over when the first one scrolls out.
        const visible = rows.find((row) => visibleRows.has(row));
        if (visible) {
          onVisibleMeetingChange(visible.dataset.meetingId ?? null);
        }
      },
      { rootMargin: "-15% 0px -55% 0px", threshold: 0 },
    );
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [onVisibleMeetingChange, shown]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="schedule-heading">
      <h3
        id="schedule-heading"
        className="font-display text-xl font-extrabold text-white md:text-2xl"
      >
        Coming up
      </h3>

      {/* Sits with the list it acts on rather than in the card header, where the
          console puts a card's one ACTION and where check-in already lives.
          Hidden when there is nothing to tell apart: a single chip filters a
          list into itself. */}
      {filters.length > 1 && (
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter the schedule"
        >
          {filters.map((badge) => (
            <button
              key={badge.label}
              type="button"
              aria-pressed={active === badge.label}
              onClick={() =>
                setActive(active === badge.label ? null : badge.label)
              }
              className={`${CHIP_DARK_CLS} inline-flex cursor-pointer items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                active === badge.label
                  ? "border-white bg-white text-black"
                  : `${NEUTRAL_CHIP_DARK_CLS} hover:border-white/50`
              }`}
            >
              <span
                aria-hidden
                className={`inline-block size-1.5 shrink-0 rounded-full ${badge.dotDark}`}
              />
              {badge.label}
            </button>
          ))}
        </div>
      )}

      {meetings.length === 0 ? (
        <EmptySchedule />
      ) : shown.length === 0 ? (
        // A second empty state, distinct from the one above on purpose. That one
        // is a fact about the club, that there are no meetings; this one is a
        // fact about the filter, which the reader can undo. Saying "no meetings
        // coming up" here would be a lie, and the chips stay visible above so
        // there is a way back.
        <NoMatches onClear={() => setActive(null)} />
      ) : (
        <div ref={listRef} className="flex flex-col gap-6">
          {weeks.map((week) => (
            <div key={week.key} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-mauve-400 uppercase">
                {weekLabel(week.key)}
              </h4>
              {/* The console's list idiom: a stack of bordered tiles, like the
                  audit log's rows, rather than the ruled ledger the light
                  dialect draws. Its own `ul` per week, because an `h4` cannot
                  be a child of `ul`, whose only legal children are `li`. */}
              <ul className="flex flex-col gap-2">
                {week.meetings.map((meeting) => (
                  <ScheduleRow
                    key={meeting.id}
                    meeting={meeting}
                    now={now}
                    onHighlight={onHighlightedMeetingChange}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The filter matched nothing, which is not the same state as an empty schedule
 * and must not borrow its copy.
 *
 * `EmptySchedule` says something true about the club; this says something true
 * about a control the reader is holding, and hands back the way out. The same
 * dashed well, quieter: a dead end the reader made and can undo in one click.
 */
function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-mauve-700 bg-white/5 px-5 py-6">
      <p className="text-sm/relaxed text-mauve-300">
        Nothing coming up matches that filter.
      </p>
      <button type="button" onClick={onClear} className={ACTION_DARK_CLS}>
        Show everything
      </button>
    </div>
  );
}

/**
 * Months of the year, not an error.
 *
 * This is the live state through every summer and both breaks, so it reads as a
 * status rather than an apology: nothing is scheduled, here is when that
 * changes, here is the one place that has anything meanwhile. An "unable to load
 * events" framing would send members to Discord to report a bug that is really
 * just August.
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

function ScheduleRow({
  meeting,
  now,
  onHighlight,
}: {
  meeting: MeetingInRange;
  now: Date;
  onHighlight?: (meetingId: string | null) => void;
}) {
  // Derived chips and the officer's kind, composed together. Both are shown: a
  // social that also runs a workshop is a real night, and a row printing only
  // the kind would drop the workshop. `segments` is empty for a night an officer
  // named, so rendering it alone would show no chip at all.
  const { segments } = resolveMeetingSegments(meeting);
  const badges = meetingBadges({ kind: meeting.kind, segments });

  // `endsAt`, not `startsAt`: a meeting already underway is still the thing a
  // member walking over cares about, and "started 40 minutes ago" is a worse
  // answer than saying it is on right now.
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;

  // A cancelled night STAYS on the schedule, struck through. Deleting it in
  // Airtable would remove it, and that is the failure this replaced: somebody
  // with the date in their calendar sees nothing at all and walks over anyway.
  const cancelled = meeting.cancelledAt !== null;

  // Every row prints its room, but only one *not* in the usual room earns a chip
  // saying so. This used to be a regex over the typed location, which failed
  // closed: an unrecognised string flagged a room change that might not have
  // happened, and it needed a second guard to stay quiet. A picked building
  // answers it outright, and a null one says nothing rather than guessing.
  const elsewhere = meeting.building !== null && meeting.building !== "DLW";

  return (
    <li
      data-meeting-id={meeting.id}
      className="relative flex gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-4 transition-colors focus-within:border-white/30 focus-within:bg-white/10 hover:border-white/30 hover:bg-white/10 md:gap-5"
      onPointerEnter={() => onHighlight?.(meeting.id)}
      onPointerLeave={() => onHighlight?.(null)}
      onFocus={() => onHighlight?.(meeting.id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onHighlight?.(null);
      }}
    >
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
          wider than the viewport, the phone case this band is built for. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-display text-base leading-tight font-extrabold text-white md:text-lg">
            {/*
              A stretched link, not a wrapper: the row also carries links to
              competition pages, and an <a> inside an <a> is invalid markup the
              browser silently un-nests, which breaks hydration. The pseudo
              element covers the row for the pointer while the accessible name
              stays the meeting's own, and the inner links sit above it.

              `meetingTitle`, not `nameOverride` directly: this heading is the
              row's whole click target and its accessible name, so it can never
              be empty, and `nameOverride` is null for most nights now. What it
              derives does not restate the chips below. They say a night taught
              something; this says *what*: "Workshop: Next.js & Flutter". Only
              with neither a name nor an agenda does it fall back to the date,
              which the span beneath repeats in full; that rare case is the one
              redundant one.
            */}
            <Link
              href={`/events/${meeting.slug}`}
              className={`rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                cancelled ? "line-through decoration-2" : ""
              }`}
            >
              {meetingTitle(meeting, meeting.workshops)}
            </Link>
          </h3>
          {/* A cancelled night keeps its row and loses its countdown. "In two
              days" beside a meeting that is not happening is the wrong half; the
              strike-through and the word are the useful half. */}
          <span className="text-xs font-semibold text-mauve-400">
            {cancelled ? (
              // Not dimmed, deliberately. `opacity-60` used to sit on the whole
              // tile, which knocked 40% off THIS, already the page's smallest
              // and dimmest token, and off the reason below it, landing both
              // near 4.2:1 against the plate and under the AA floor. The
              // strike-through on the title carries "not happening"; these carry
              // the explanation and stay at full contrast.
              <span className="text-rose-300">{CANCELLED_LABEL}</span>
            ) : happeningNow ? (
              "Happening now"
            ) : (
              <time dateTime={meeting.startsAt.toISOString()}>
                {formatRelative(meeting.startsAt, now)}
              </time>
            )}
          </span>
        </div>

        {cancelled && meeting.cancellationReason !== null && (
          <p className="text-xs text-rose-300 md:text-sm">
            {meeting.cancellationReason}
          </p>
        )}

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
          Derived chips then the officer's kind, composed by `meetingBadges`. A
          kind with no hue of its own renders verbatim in the neutral pill, and
          three of the four do, by design. See `kindBadge`: the list is closed,
          so this is the un-coloured case rather than the unknown one.
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
      {/* Same absence as the event page's row, and the same refusal to dress
          it up: with no project to name, the chip is just the word. */}
      {`Judging: ${workshopLabel(judging)}`}
    </Link>
  );
}

function WorkshopChip({ workshop }: { workshop: MeetingRangeWorkshop }) {
  // A null `competitionSlug` is a *supplementary* workshop: a session complete
  // on its own and an ordinary thing for a Wednesday. So it gets a chip of the
  // same size, weight and colour family as any other workshop. No faded state,
  // no "no competition" caveat, no empty slot where a link would have been. The
  // only difference is a span rather than an anchor, because there is nowhere to
  // go. Dressing the absence up as a gap would tell members a complete session
  // was broken.
  const badge =
    workshop.competitionSlug === null
      ? segmentBadge.workshop
      : segmentBadge.kickoff;
  const chipCls = `${badge.chipDark} ${CHIP_DARK_CLS}`;

  // `workshopLabel`, not `projectName`: the title is what officers name a
  // session by, and `projectName` is null for one that teaches a skill rather
  // than a codebase, which rendered the career-fair-readiness night as an empty
  // chip. The fallback matches `/events/<slug>`, so the schedule and the
  // permalink cannot print two different words for one row.
  const label = workshopLabel(workshop);

  if (workshop.competitionSlug === null) {
    return <span className={chipCls}>{label}</span>;
  }

  return (
    <Link
      href={`/competitions/${workshop.competitionSlug}/teams`}
      className={`${chipCls} ${CHIP_LINK_CLS}`}
    >
      {label}
    </Link>
  );
}
