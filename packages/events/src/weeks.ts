/**
 * Club weeks: Monday to Sunday in the club's timezone (Athens time).
 *
 * Streaks, the weekly art and the semester ranges all count in these weeks, so
 * the arithmetic lives once, here, and nothing reads the host's timezone. A
 * week is named by its Monday as `YYYY-MM-DD`; dates are civil dates, so a
 * DST change never shifts a week (the 23- and 25-hour days still belong to the
 * week their Athens date does).
 */

/** The IANA zone every club week and day is read in. */
export const CLUB_WEEK_TIMEZONE = "America/New_York";

const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_WEEK_TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a real calendar date written `YYYY-MM-DD`. */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toUtcDate(key: string): Date {
  const match = DATE_KEY.exec(key);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${key}`);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The club-timezone calendar date of an instant, `YYYY-MM-DD`. */
export function clubDateKey(at: Date): string {
  const parts = DAY_PARTS.formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return toKey(
    new Date(Date.UTC(read("year"), read("month") - 1, read("day"))),
  );
}

/** `key` moved by `days` civil days (negative goes back). */
export function addDays(key: string, days: number): string {
  const date = toUtcDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** The Monday on or before a civil date. */
export function mondayOf(key: string): string {
  const daysSinceMonday = (toUtcDate(key).getUTCDay() + 6) % 7;
  return addDays(key, -daysSinceMonday);
}

/** True when a civil date is a Monday. */
export function isMonday(key: string): boolean {
  return toUtcDate(key).getUTCDay() === 1;
}

/** The club week an instant falls in, named by its Monday. */
export function clubWeekStart(at: Date): string {
  return mondayOf(clubDateKey(at));
}

/** Every week from `first` to `last` inclusive, oldest first (both Mondays). */
export function weekRange(first: string, last: string): string[] {
  const weeks: string[] = [];
  for (let week = first; week <= last; week = addDays(week, 7)) {
    weeks.push(week);
  }
  return weeks;
}
