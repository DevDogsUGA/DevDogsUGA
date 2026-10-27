import { EVENT_TZ } from "@devdogsuga/sdk/brand/event";

/**
 * Converting between an ISO instant and the wall-clock string a
 * `datetime-local` input holds, in the club's timezone and not the browser's.
 *
 * The schedule editor shows and takes times as the room sees them (Eastern);
 * the config stores UTC instants. Neither direction may use the server's own
 * zone (a Worker runs in UTC), so both go through `Intl` with `EVENT_TZ`.
 */

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallParts(at: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of PARTS.formatToParts(at)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

/** An ISO instant as `YYYY-MM-DDTHH:mm` on the club's wall clock. */
export function isoToClubLocal(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const p = wallParts(at);
  const two = (n: number | undefined) => String(n ?? 0).padStart(2, "0");
  return `${String(p.year).padStart(4, "0")}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * A club wall-clock `YYYY-MM-DDTHH:mm` as a UTC ISO instant
 * (`2026-09-14T22:00:00.000Z`), or null when it is not a real time.
 *
 * Treat the wall time as UTC, read what the club clock says at that instant,
 * and correct by the difference; once more settles the hour either side of a
 * daylight-saving change.
 */
export function clubLocalToIso(local: string): string | null {
  const match = LOCAL.exec(local.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const p = wallParts(new Date(guess));
    const shown = Date.UTC(p.year!, p.month! - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  const at = new Date(guess);
  const back = wallParts(at);
  if (
    back.year !== year ||
    back.month !== month ||
    back.day !== day ||
    back.hour !== hour ||
    back.minute !== minute
  ) {
    return null;
  }
  return at.toISOString();
}
