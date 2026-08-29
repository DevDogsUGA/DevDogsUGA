/**
 * Every time the platform shows is in the club's timezone, not the viewer's.
 *
 * This is the one formatting decision here that is not a preference. A meeting
 * at 18:00 Eastern is at 18:00 for everybody who will be in the room, so a
 * member checking from a co-op in Seattle wants to know when the thing happens
 * where it happens — rendering 15:00 for them is technically correct and
 * useless, and it is actively wrong the moment they screenshot it for somebody
 * on campus.
 *
 * The same reasoning governs the CSV export writing ISO 8601 with an explicit
 * offset: a bare local timestamp is read in whatever zone the reader is in.
 * Here we resolve that by naming the zone; there, by naming the offset. Both
 * refuse to let the reader's location change what the value means.
 */
export const EVENT_TZ = "America/New_York";

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
 * field order belong to ICU and are not ours to assume, and a `split("/")`
 * would quietly start filing meetings under the wrong month if either changed.
 *
 * Month is **1-indexed here**, unlike `clubDay` below. The consumer that wants
 * `Date#getMonth` semantics subtracts one at the edge, which keeps the one
 * place needing a real calendar month — the ISO key — from having to add it
 * back. That round trip is exactly how an off-by-one month ships looking
 * completely normal.
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
 * tomorrow while it is still this evening in Athens — so a "today" highlight
 * would land on the wrong square for several hours every night, and a meeting
 * would bucket into the wrong week. Worse in a client component: SSR and
 * hydration would answer differently, making it a hydration mismatch on top of
 * a wrong square.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is the pure way to ask —
 * unlike `@date-fns/tz`, whose `TZDate` constructor reads the clock and would
 * drop a calling page out of the prerendered shell (see
 * docs/platform/caching.md, "Clock reads in client components"). This reads no
 * clock and touches nothing but its argument, so it is safe in a client
 * component and gives byte-identical answers on both sides of hydration.
 *
 * This is the only copy. It had two private ones — `MonthCalendar` and the
 * events layout — and both are gone; add a caller here rather than a fourth
 * formatter somewhere else.
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
 * `YYYY-MM-DD` in the club's timezone — the meeting slug, and the key a week
 * grouper buckets on.
 *
 * **Never `toISOString().slice(0, 10)`.** That reads the UTC date, which rolls
 * at 20:00 Eastern under EDT and 19:00 under EST. The club's 18:00 slot clears
 * that by two hours, so the naive version is right for every meeting on the
 * books today and wrong for the first 20:00 social somebody schedules — a bug
 * that ships green and fires on exactly the one night nobody wrote a fixture
 * for. Nothing constrains the hour: the only temporal check on the table is
 * `endsAt > startsAt`.
 *
 * Zero-padded by hand rather than by leaning on `en-CA` happening to emit ISO
 * order, for the same reason `clubDateParts` reads by part type.
 */
export function clubDateKey(at: Date): string {
  const { year, month, day } = clubDateParts(at);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Formatted on the SERVER, deliberately.
 *
 * Formatting in the browser would use the viewer's zone unless every call site
 * remembered to pass `EVENT_TZ` — and the one that forgets produces a page
 * that looks right to whoever built it and wrong to everybody in another
 * state. Server-rendered strings also match between the HTML and the hydrated
 * markup, which a `toLocaleString` without an explicit zone does not.
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
 * not cross midnight, so the two-date case is not handled — if one ever does,
 * this should print both rather than silently show the start date for an end
 * time on the following day.
 */
export function formatEventSpan(startsAt: Date, endsAt: Date): string {
  const sameDay = formatEventDate(startsAt) === formatEventDate(endsAt);

  return sameDay
    ? `${formatEventDate(startsAt)}, ${formatEventTime(startsAt)} – ${formatEventTime(endsAt)}`
    : `${formatEventDateTime(startsAt)} – ${formatEventDateTime(endsAt)}`;
}

/** Relative, for "closes in 2 hours" — the thing a voter actually needs. */
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
