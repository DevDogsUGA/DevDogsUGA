/**
 * Dates as officers type them. Meetings happen in Athens, so a bare
 * `2026-09-30` means that Eastern day, never UTC's: UTC's date rolls at 20:00
 * Eastern, and the platform's old `to=` filter cut off the evening's meeting
 * on exactly the day it named.
 */
export const EVENT_TZ = "America/New_York";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(text: string): boolean {
  return DAY.test(text);
}

/** Minutes `zone` is ahead of UTC at `at` (negative west of Greenwich). */
function offsetMinutes(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Midnight at the start of `day` (YYYY-MM-DD) in {@link EVENT_TZ}. */
export function startOfDay(day: string, zone = EVENT_TZ): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  // The offset at local midnight, found from a guess a few hours later so a
  // DST change (always at 02:00 in the US) cannot land between them.
  const probe = new Date(utcMidnight.getTime() + 6 * 3_600_000);
  return new Date(utcMidnight.getTime() - offsetMinutes(probe, zone) * 60_000);
}

/** Midnight at the start of the day after `day`. */
export function endOfDay(day: string, zone = EVENT_TZ): Date {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDay(next.toISOString().slice(0, 10), zone);
}

/** The Eastern calendar date of `at`, as YYYY-MM-DD. */
export function dayOf(at: Date, zone = EVENT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
