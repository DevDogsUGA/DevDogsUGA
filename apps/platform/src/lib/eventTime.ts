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
