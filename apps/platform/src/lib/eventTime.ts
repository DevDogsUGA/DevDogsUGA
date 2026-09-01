/**
 * Every time the platform shows is in the club's timezone, not the viewer's.
 *
 * A meeting at 18:00 Eastern is at 18:00 for everybody who will be in the room.
 * Rendering 15:00 for a member on a co-op in Seattle is technically correct and
 * useless, and it is wrong the moment they screenshot it for somebody on
 * campus.
 *
 * The CSV export writes ISO 8601 with an explicit offset for the same reason: a
 * bare local timestamp is read in whatever zone the reader is in. Here we name
 * the zone, there the offset.
 *
 * The zone itself is DECLARED in `@devdogsuga/og/event` and re-exported here,
 * so this module stays the one place the app imports it from. It moved because
 * a second renderer needs it: `pnpm devtools images` draws the same event cards
 * to disk for the GDG on Campus platform, and a CLI cannot import a module out
 * of this Next app. One definition, two callers, rather than a constant copied
 * into a package where nothing would notice it drifting.
 *
 * That entry point imports nothing at all — deliberately, because
 * `lib/meetingTitle.ts` imports EVENT_TZ and is safe for a client component.
 * Routing it through `@devdogsuga/og`'s index instead would put a few hundred
 * kilobytes of embedded fonts one bundler decision away from the browser.
 */
export { EVENT_TZ } from "@devdogsuga/og/event";
import { EVENT_TZ } from "@devdogsuga/og/event";

const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/**
 * The club-timezone calendar date of an instant, as its raw parts.
 *
 * `formatToParts` rather than parsing a formatted string: the separator and
 * field order belong to ICU, and a `split("/")` would start filing meetings
 * under the wrong month if either changed.
 *
 * Month is **1-indexed here**, unlike `clubDay` below. `clubDay` subtracts one
 * at the edge, so `clubDateKey`, the one caller needing a real calendar month,
 * does not have to add it back.
 */
function clubDateParts(at: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = DAY_PARTS.formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

/**
 * `{ year, month, day }` with a **0-indexed** month, matching `Date#getMonth`.
 *
 * `getDate()` would answer in the *server's* zone, and a UTC host is already on
 * tomorrow while it is still this evening in Athens. A "today" highlight would
 * land on the wrong square for several hours every night, and a meeting would
 * bucket into the wrong week. In a client component SSR and hydration would
 * also answer differently, so it is a hydration mismatch on top of a wrong
 * square.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is the pure way to ask.
 * `@date-fns/tz`'s `TZDate` constructor reads the clock and would drop a
 * calling page out of the prerendered shell (see docs/monorepo/stack/nextjs.md,
 * "Why does a client component that formats a date drop the page out of the
 * static shell?"). This reads no clock and touches nothing but its argument, so
 * it is safe in a client component and gives byte-identical answers on both
 * sides of hydration.
 *
 * This is the only copy. `MonthCalendar` and the events layout had private ones
 * and both are gone; add a caller here rather than a fourth formatter
 * somewhere else.
 */
export function clubDay(at: Date): {
  year: number;
  month: number;
  day: number;
} {
  const { year, month, day } = clubDateParts(at);
  return { year, month: month - 1, day };
}

/**
 * The instant midnight-on-the-1st happens in the club's timezone.
 *
 * ⚠️ The bound `getMeetingsInRange` filters on, and it must not be
 * `Date.UTC(year, month, 1)`.
 *
 * That was the bug. `clubDay` resolves year and month in America/New_York, and
 * feeding those parts to `Date.UTC` reads them as a UTC wall-clock time. Under
 * EDT that instant is 20:00 on the LAST DAY OF THE PREVIOUS MONTH, shifting the
 * window four hours (five under EST) in both directions.
 *
 * A 20:00 Eastern social on the final day of the range has `startsAt` = 00:00
 * UTC the next day, so it fell outside the exclusive upper bound and vanished
 * from /events entirely. Symmetrically, a 20:00 meeting on the last evening
 * BEFORE the window was included by the query and then filed by `clubDay` under
 * a month the calendar's own paging bounds cannot reach: a row fetched,
 * counted, and unreachable.
 *
 * Same four hours as the `clubDateKey` warning below, from the other direction.
 * That one reads a UTC date out of an instant, this one builds an instant out
 * of club-zone parts. Both fire only on a meeting past 20:00, the night nobody
 * wrote a fixture for.
 *
 * Two passes, which is what makes it correct across a DST boundary. The first
 * offset is measured at the naive guess; applying it can land on the other side
 * of a transition, so the offset is measured again at the corrected instant and
 * reapplied. March's 01:00-does-not-exist hour cannot arise here, since the 1st
 * of a month at midnight is never a US transition (those happen on a Sunday at
 * 02:00), but the second pass costs nothing.
 *
 * Pure `Intl` rather than `@date-fns/tz`, for the reason `clubDay` gives: this
 * reads no clock, so it is safe anywhere and identical on both sides of
 * hydration.
 */
export function clubMonthStart({
  year,
  month,
}: {
  year: number;
  /** 0-indexed, matching `clubDay` and `Date#getMonth`. */
  month: number;
}): Date {
  const naive = Date.UTC(year, month, 1);
  const firstPass = naive - zoneOffsetMs(naive);
  return new Date(naive - zoneOffsetMs(firstPass));
}

/**
 * How far ahead of UTC the club's zone is at a given instant, in milliseconds.
 *
 * Negative for America/New_York: -4h under EDT, -5h under EST. Derived by
 * formatting the instant INTO the zone and reading the wall clock back out,
 * the only way to ask without a timezone database of our own.
 */
function zoneOffsetMs(instant: number): number {
  const parts = OFFSET_PARTS.formatToParts(new Date(instant));
  const at = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part === undefined ? 0 : Number(part.value);
  };
  // `hourCycle: "h23"` below is why midnight reads as 0 rather than 24.
  const wall = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour"),
    at("minute"),
    at("second"),
  );
  return wall - instant;
}

const OFFSET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/**
 * `YYYY-MM-DD` in the club's timezone: the meeting slug, and the key a week
 * grouper buckets on.
 *
 * **Never `toISOString().slice(0, 10)`.** That reads the UTC date, which rolls
 * at 20:00 Eastern under EDT and 19:00 under EST. The club's 18:00 slot clears
 * that by two hours, so the naive version is right for every meeting on the
 * books today and wrong for the first 20:00 social somebody schedules. It ships
 * green and fires on the one night nobody wrote a fixture for. Nothing
 * constrains the hour: the only temporal check on the table is
 * `endsAt > startsAt`.
 *
 * Zero-padded by hand rather than leaning on `en-CA` happening to emit ISO
 * order, for the same reason `clubDateParts` reads by part type.
 */
export function clubDateKey(at: Date): string {
  const { year, month, day } = clubDateParts(at);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * How far past the current month the schedule may reach. See `scheduleWindow`.
 *
 * Twelve rather than something tighter because a spring semester authored in
 * November is ordinary and must not be clipped. This is a guard against a
 * mistyped year, not a statement about how far ahead the club plans.
 */
export const MAX_MONTHS_AHEAD = 12;

/** `{ year, month }` with a 0-indexed month, the shape `clubDay` returns. */
export interface ClubMonth {
  year: number;
  /** 0-indexed, matching `clubDay` and `Date#getMonth`. */
  month: number;
}

/** Months since year zero, so two `ClubMonth`s can be compared or offset. */
export function addMonths(at: ClubMonth, delta: number): ClubMonth {
  const total = at.year * 12 + at.month + delta;
  return { year: Math.floor(total / 12), month: total % 12 };
}

function monthIndex({ year, month }: ClubMonth): number {
  return year * 12 + month;
}

/**
 * The months `/events` loads: one back, and forward as far as the base goes.
 *
 * ⚠️ The forward bound must follow the DATA, and it used to be a constant.
 *
 * That was the bug. The window was fixed at two months ahead on the stated
 * grounds that "a semester is announced in chunks and two months is as far
 * ahead as the base is ever filled in". The first time officers authored a
 * whole semester in one sitting, that stopped being true and the comment
 * became the defect: every meeting past the bound synced into Postgres and
 * appeared on no surface at all. Not on the calendar, not in the schedule
 * list, and not reachable by paging either, because the page derives its
 * paging bounds from this same span. From the officers' side of Airtable that
 * is indistinguishable from the sync ignoring the rows, which is exactly what
 * it was reported as.
 *
 * Two clamps, and they are different in kind. The floor is a promise to the
 * reader: an empty base still gets a calendar somebody can page forward
 * through rather than one that dead-ends on today. The ceiling is a guard
 * against a typo, because a meeting entered as 2126 would otherwise hand the
 * calendar a thousand empty months to walk.
 *
 * Returns `to` EXCLUSIVE, matching `getMeetingsInRange`. The last meeting on
 * the books is inside the window because the bound is the month after it.
 */
export function scheduleWindow(
  today: ClubMonth,
  /** When the furthest-out meeting starts, or null if there are none. */
  furthest: Date | null,
): { from: ClubMonth; to: ClubMonth } {
  const from = addMonths(today, -1);
  const floor = addMonths(today, 2);

  if (furthest === null) return { from, to: floor };

  // `clubDay`, never `getUTCMonth()`. A 20:00 meeting on the last day of a
  // month is already the following month in UTC, and filing it one square
  // forward would widen the window by a month for no reason — or, on the 31st
  // of December, by a year. Same rollover the rest of this file exists for.
  const wanted = addMonths(clubDay(furthest), 1);
  const ceiling = addMonths(today, MAX_MONTHS_AHEAD);

  if (monthIndex(wanted) < monthIndex(floor)) return { from, to: floor };
  if (monthIndex(wanted) > monthIndex(ceiling)) return { from, to: ceiling };
  return { from, to: wanted };
}

/**
 * Formatted on the SERVER, deliberately.
 *
 * Formatting in the browser would use the viewer's zone unless every call site
 * remembered to pass `EVENT_TZ`, and the one that forgets produces a page that
 * looks right to whoever built it and wrong to everybody in another state.
 * Server-rendered strings also match between the HTML and the hydrated markup,
 * which a `toLocaleString` without an explicit zone does not.
 */
export function formatEventDateTime(at: Date | string): string {
  return new Date(at).toLocaleString("en-US", {
    timeZone: EVENT_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatEventDate(at: Date | string): string {
  return new Date(at).toLocaleDateString("en-US", {
    timeZone: EVENT_TZ,
    dateStyle: "medium",
  });
}

export function formatEventTime(at: Date | string): string {
  return new Date(at).toLocaleTimeString("en-US", {
    timeZone: EVENT_TZ,
    timeStyle: "short",
  });
}

/**
 * A meeting's span, without repeating the date.
 *
 * "Sep 10, 2026, 6:00 – 8:00 PM" rather than the same date twice. Meetings do
 * not cross midnight, so the two-date case is not handled. If one ever does,
 * this should print both rather than show the start date for an end time on the
 * following day.
 */
export function formatEventSpan(startsAt: Date, endsAt: Date): string {
  const sameDay = formatEventDate(startsAt) === formatEventDate(endsAt);

  return sameDay
    ? `${formatEventDate(startsAt)}, ${formatEventTime(startsAt)} – ${formatEventTime(endsAt)}`
    : `${formatEventDateTime(startsAt)} – ${formatEventDateTime(endsAt)}`;
}

/** Relative, for "closes in 2 hours", which is what a voter needs. */
export function formatRelative(at: Date, now = new Date()): string {
  const seconds = Math.round((at.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  for (const [unit, size] of units) {
    if (abs >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }

  return formatter.format(seconds, "second");
}
