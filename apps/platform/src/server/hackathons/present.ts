/**
 * How the Hackathons page orders what it shows. Pure, so the page and its
 * tests share one copy and the clock is an argument.
 */

export type ListedHackathon = {
  id: string;
  name: string;
  url: string;
  location: string;
  openState: string | null;
  dateLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

/** Where an event stands, for its badge; `null` when we cannot tell. */
export type HackathonStatus = "open" | "upcoming" | "earlier" | null;

/** The most earlier events the page lists, newest first. */
export const EARLIER_LIMIT = 25;

/**
 * Whether an event is still to come or running at `today` (an ISO day): not
 * marked closed, and not ended by its dates. An event with no dates counts as
 * current until it is marked closed, since the feed never says it is over
 * (absence from it proves nothing, D0 section 5).
 */
export function isCurrent(h: ListedHackathon, today: string): boolean {
  return h.openState !== "closed" && (h.endsOn === null || h.endsOn >= today);
}

/**
 * An event's badge. Devpost's own word wins while the event is current; for a
 * member's submission it comes from the dates, and an undated one has none.
 */
export function statusOf(h: ListedHackathon, today: string): HackathonStatus {
  if (!isCurrent(h, today)) return "earlier";
  if (h.openState === "open" || h.openState === "upcoming") return h.openState;
  if (h.startsOn === null) return null;
  return h.startsOn > today ? "upcoming" : "open";
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const formatDay = (day: string) =>
  DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));

/**
 * When an event runs, as text: Devpost's own label if it gave one, else the
 * dates a member entered, else `null`.
 */
export function whenText(h: ListedHackathon): string | null {
  if (h.dateLabel) return h.dateLabel;
  if (h.startsOn && h.endsOn)
    return h.startsOn === h.endsOn
      ? formatDay(h.startsOn)
      : `${formatDay(h.startsOn)} \u2013 ${formatDay(h.endsOn)}`;
  if (h.startsOn) return `Starts ${formatDay(h.startsOn)}`;
  if (h.endsOn) return `Ends ${formatDay(h.endsOn)}`;
  return null;
}

/** Ascending, with an unknown day after every known one. */
const soonest = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
/** Descending, with an unknown day after every known one. */
const latest = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a > b ? -1 : 1;

/**
 * The approved hackathons in display order: open or upcoming first, soonest to
 * start first (undated last, by name), then the most recent earlier ones.
 */
export function orderHackathons<T extends ListedHackathon>(
  rows: readonly T[],
  today: string,
): {
  current: (T & { status: HackathonStatus })[];
  earlier: (T & { status: HackathonStatus })[];
} {
  const current = rows
    .filter((h) => isCurrent(h, today))
    .sort(
      (a, b) => soonest(a.startsOn, b.startsOn) || a.name.localeCompare(b.name),
    );
  const earlier = rows
    .filter((h) => !isCurrent(h, today))
    .sort((a, b) => latest(a.endsOn, b.endsOn) || a.name.localeCompare(b.name))
    .slice(0, EARLIER_LIMIT);
  const withStatus = (h: T) => ({ ...h, status: statusOf(h, today) });
  return { current: current.map(withStatus), earlier: earlier.map(withStatus) };
}
