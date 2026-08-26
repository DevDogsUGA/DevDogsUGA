import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarDotsIcon,
  MapPinIcon,
} from "@phosphor-icons/react/ssr";
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
import { RouteDialogLink } from "~/ui/route-dialog";
import { FindUsLink } from "~/components/EventsSection/FindUs";
import { ACTION_CLS, CHIP_CLS, segmentBadge } from "./meetingView";
import { isMappedBuilding, locationLine } from "./FindUs/buildings";

/**
 * The first section of /events: the next meeting, at the size of the only
 * thing on the page anybody came for. Everything below it — the ledger, the
 * calendar, the explainer — is context for this one night.
 *
 * Not a card. It used to be a white box with a block shadow, and the page
 * below it was a calendar box, a column of row boxes and a table box; the
 * next meeting is the biggest type on the page and needs no frame to be
 * found. The section's own rule above it, drawn by the page, is the only
 * chrome.
 *
 * ## It never reads the clock
 *
 * Not `new Date()`, not `Date.now()`, and deliberately not `@date-fns/tz`
 * either: `TZDate`'s constructor reads the clock unconditionally, so a single
 * `format(…, { in: tz(EVENT_TZ) })` here would be a clock read wearing a
 * formatting function's clothes. A read in this tree postpones the boundary
 * and drops /events out of the static shell with no error message at all —
 * the failure is silent, and the only symptom is a near-empty `.html` in
 * `.next/server/app/`. See `docs/platform/caching.md`, "Clock reads in client
 * components", for the full trap.
 *
 * So `now` arrives as a prop, resolved once by the caller for the whole page,
 * and every zone-aware string below goes through `Intl.DateTimeFormat` with an
 * explicit `timeZone` — the pure equivalent, and what the calendar already
 * uses.
 *
 * This band also does not load anything. The caller owns the query, which is
 * what lets it hand the same `meeting` to the bands underneath rather than
 * having each one re-derive "the next meeting" and risk disagreeing about
 * which night that is.
 */

interface Props {
  /** The next meeting, or null when nothing is on the calendar. */
  meeting: MeetingInRange | null;
  /**
   * "Now", resolved by the caller once for the whole page.
   *
   * A prop rather than a read, and shared rather than per-band, so this
   * band's "in 3 days" and the calendar's highlighted day cannot disagree
   * because the clock ticked between two renders.
   */
  now: Date;
  /**
   * The uncached check-in island, created OUTSIDE the cache scope by the
   * caller and passed in as an element.
   *
   * It reads the visitor's session, and `cookies()` anywhere inside a
   * `"use cache"` scope is a hard build error — but an element constructed
   * outside that scope renders outside it too, so passing it through as a prop
   * is legal where rendering `<CheckIn />` in the cached body is not.
   */
  checkIn?: ReactNode;
}

/**
 * Constructed once at module scope. Formatter construction is pure — it is
 * `TZDate` that reads the clock, not `Intl` — and building three of these per
 * render for a band that shows one date is waste the prerender pays for.
 */
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "long",
});

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  day: "numeric",
});

const MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  month: "short",
});

/** "Astro and Loop", not "Astro, Loop" — the agenda line is prose, not a table. */
const NAME_LIST_FMT = new Intl.ListFormat("en-US", {
  style: "long",
  type: "conjunction",
});

/**
 * The band's primary action, at the size the page footer uses.
 *
 * Deliberately the same neutral bordered white as every other action on the
 * page rather than a filled accent: `meetingView` treats colour as
 * information — cyan means competition, amber means workshop — and a cyan
 * button sitting a few pixels from a cyan Judging chip would read as a third
 * kind of segment rather than as a link.
 */
const PRIMARY_ACTION_CLS =
  "hover:shadow-block-md transition-lift flex w-fit items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

export default function NextMeeting({ meeting, now, checkIn }: Props) {
  // Not an error state, and not a rare one: this is what the page looks like
  // through the summer and between semesters, which is months at a time.
  if (meeting === null) return <NothingScheduled />;

  // Both come back from the resolver rather than one replacing the other, and
  // both are rendered: a social that also runs a workshop is a real night, and
  // showing only the override would quietly drop the workshop.
  const { segments, kindOverride } = resolveMeetingSegments(meeting);

  // Half-open on the end, matching `isJudgedDuring`: at the instant a meeting
  // ends it is over, not still on.
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  // `now` is baked at prerender while the band is served from cache, so it can
  // legitimately sit past a meeting the caller still considers "next". Without
  // this branch the relative line would read "Starts 2 hours ago".
  const ended = now >= meeting.endsAt;

  const agenda = agendaLine(meeting);

  return (
    <article
      className="flex flex-col gap-6 md:flex-row md:items-start md:gap-12"
      data-animate="fade-up"
    >
      <DateBlock at={meeting.startsAt} />

      {/* `min-w-0` on the text column: a flex child defaults to
          min-width:auto and refuses to shrink below its longest word, which is
          how a long meeting name turns a 390px viewport into a horizontal
          scroll. */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-black">
            {happeningNow ? (
              <>Happening now — until {formatEventTime(meeting.endsAt)}</>
            ) : ended ? (
              <>Ended {formatRelative(meeting.endsAt, now)}</>
            ) : (
              <>Starts {formatRelative(meeting.startsAt, now)}</>
            )}
          </p>

          <h3 className="font-display text-4xl font-extrabold text-balance break-words text-black md:text-6xl">
            {meeting.name}
          </h3>

          <p className="text-sm text-mauve-700">
            <time dateTime={meeting.startsAt.toISOString()}>
              {formatEventSpan(meeting.startsAt, meeting.endsAt)}
            </time>
          </p>
        </div>

        {(segments.length > 0 || kindOverride !== null) && (
          <div className="flex flex-wrap items-center gap-2">
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
            {/* Verbatim, in a neutral chip. `kind` is an Airtable
                single-select an officer can extend without touching this
                repo, so a value this side has never heard of has to render
                as itself rather than fall through to a blank badge. */}
            {kindOverride !== null && (
              <span
                className={`border-2 border-black bg-white text-black ${CHIP_CLS}`}
              >
                {kindOverride}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="flex min-w-0 items-center gap-2 text-sm text-mauve-700">
            <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
            {locationLine(meeting.building, meeting.location) ??
              "Room to be announced"}
          </p>
          {/* Only for a building this site can draw. `Other` and null fall
              through to plain text, because directions that walk somebody to
              the wrong building are worse than an address they have to read —
              see `isMappedBuilding`.

              `FindUsLink`, not the in-place `FindUs` dialog: on this page
              /events/directions is a sibling route under the layout holding
              the calendar, so following it swaps only the leaf and the
              calendar behind stays mounted. */}
          {isMappedBuilding(meeting.building) && (
            <FindUsLink building={meeting.building} room={meeting.location} />
          )}
        </div>

        {/* Plain text from Airtable, rendered as text. Never as markup: an
            officer typed it into a form field, it was not authored here. */}
        {meeting.summary !== null && (
          <p className="max-w-prose text-sm/relaxed text-mauve-700">
            {meeting.summary}
          </p>
        )}

        {/* One line, not the agenda: the full list — with judging times, team
            counts and competition links — is what /events/[slug] is for, and
            duplicating it here would give the band two jobs and make the
            detail link pointless. */}
        {agenda !== null && (
          <p className="line-clamp-2 max-w-prose text-sm text-mauve-600">
            <span className="font-semibold text-black">On the night: </span>
            {agenda}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* A route dialog, like the directions link above: /events/[slug]
              is a segment whose layout is the dialog frame, so this opens
              over the calendar instead of navigating away from it. */}
          <RouteDialogLink
            href={`/events/${meeting.slug}`}
            className={PRIMARY_ACTION_CLS}
          >
            Full details <ArrowRightIcon />
          </RouteDialogLink>

          {meeting.rsvpUrl !== null && (
            <a
              href={meeting.rsvpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_CLS}
            >
              RSVP <ArrowUpRightIcon />
            </a>
          )}

          {/* Whatever the caller built, rendered as-is. This band knows only
              where a check-in belongs, never whether there is one to show —
              that answer needs the session, which is exactly what cannot be
              read from in here. */}
          {checkIn}
        </div>
      </div>
    </article>
  );
}

/**
 * Weekday, then the day number at display scale, then the month — the only
 * display-scale numerals on the page, so the date is findable from across a
 * room without competing with the meeting's name for the same emphasis.
 *
 * Formatted through `Intl` with an explicit zone rather than `getDate()`,
 * which would answer in the *server's* zone: a meeting at 20:00 Eastern is
 * already tomorrow in UTC, and the band would print the wrong number for every
 * evening meeting on a UTC host.
 */
function DateBlock({ at }: { at: Date }) {
  return (
    <time
      dateTime={at.toISOString()}
      className="flex shrink-0 flex-col leading-none md:w-36 md:items-center md:text-center"
    >
      <span className="font-display text-sm font-extrabold tracking-widest text-mauve-500 uppercase">
        {WEEKDAY_FMT.format(at)}
      </span>
      <span className="font-display text-7xl font-extrabold text-black tabular-nums md:text-8xl">
        {DAY_FMT.format(at)}
      </span>
      <span className="font-display text-sm font-extrabold tracking-widest text-mauve-500 uppercase">
        {MONTH_FMT.format(at)}
      </span>
    </time>
  );
}

/**
 * What is on, in one sentence: the competitions being judged and the projects
 * being taught.
 *
 * Returns null rather than an empty string when a night carries neither, so
 * the caller renders nothing instead of a stray label. That is the ordinary
 * shape of an open build session, not missing data.
 */
function agendaLine(meeting: MeetingInRange): string | null {
  const parts: string[] = [];

  if (meeting.judgedCompetitions.length > 0) {
    const names = NAME_LIST_FMT.format(
      meeting.judgedCompetitions.map((c) => c.projectName),
    );
    parts.push(`judging ${names}`);
  }

  if (meeting.workshops.length > 0) {
    const names = NAME_LIST_FMT.format(
      meeting.workshops.map((w) => w.projectName),
    );
    const label = meeting.workshops.length === 1 ? "a workshop" : "workshops";
    parts.push(`${label} on ${names}`);
  }

  if (parts.length === 0) return null;

  // Sentence-cased by hand rather than with `first-letter:uppercase`, which
  // would capitalise a project name's deliberate lowercase in CSS and leave
  // the copied text disagreeing with what was on screen.
  const line = parts.join(", plus ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/**
 * The live state for months at a time — all summer, and between semesters.
 *
 * So it is written as a state of the club rather than a state of the query: an
 * empty band would read as something broken, and "no events" says nothing to
 * somebody deciding whether this club is worth coming back to. It says when
 * the schedule returns and gives them somewhere to go in the meantime.
 */
function NothingScheduled() {
  return (
    <article className="flex flex-col gap-4" data-animate="fade-up">
      <p className="font-display flex items-center gap-2 text-sm font-extrabold tracking-widest text-mauve-500 uppercase">
        <CalendarDotsIcon className="shrink-0" weight="fill" />
        Between semesters
      </p>

      <h3 className="font-display text-4xl font-extrabold text-balance text-black md:text-6xl">
        Nothing on the calendar yet
      </h3>

      <p className="max-w-prose text-base/relaxed text-mauve-700">
        The fall schedule goes up in August, and once it does there is something
        every week: a workshop that teaches a feature, a week-long competition
        to build it, and an open build session on the Wednesday in between.
        Everything happens in DLW 124.
      </p>

      <p className="max-w-prose text-sm/relaxed text-mauve-600">
        The Involvement Network lists every DevDogs event UGA knows about, and
        it is where RSVPs live — so it is the first place a new date shows up.
      </p>

      <a
        href={INVOLVEMENT_NETWORK_EVENTS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={PRIMARY_ACTION_CLS}
      >
        DevDogs on the Involvement Network <ArrowUpRightIcon />
      </a>
    </article>
  );
}
