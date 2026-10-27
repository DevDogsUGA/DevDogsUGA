import type { Series } from "./series.js";
import type {
  AuthoredClubConfig,
  AuthoredMeeting,
  ClubConfig,
  Meeting,
  Workshop,
} from "./schema.js";

/**
 * Applies `series.json` to `meetings.json`: the one place a meeting's title,
 * category, brand, summary and place are decided. Everything that shows a
 * title (the site, the newsletter, posters, the terminal, Bevy and Engage)
 * reads the result, so none of them can disagree.
 *
 * Pure: no clock, filesystem or database. Assumes the authored files already
 * passed `checkAuthored`, which reports a missing series or an unresolvable
 * field; this throws on those rather than guessing.
 */

const CLUB_TIME_ZONE = "America/New_York";

/** The semester an instant falls in, on the club's clock: "2026-fall". */
export function termOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")!.value;
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const season = month <= 5 ? "spring" : month <= 7 ? "summer" : "fall";
  return `${year}-${season}`;
}

/** The workshops' names, joined as a heading: one, or "A & B"; none for more. */
function topicsOf(agenda: readonly Workshop[]): string | null {
  const titles = agenda.map((w) => w.title);
  if (titles.length === 0) return null;
  if (titles.length <= 2) return titles.join(" & ");
  return null;
}

/**
 * Each series-numbered meeting's `#n`, keyed by slug: its place among that
 * series' live meetings in the same term, by start time. Cancelled meetings
 * take no number and do not use one up.
 */
export function seriesNumbers(
  meetings: readonly AuthoredMeeting[],
  series: readonly Series[],
): Map<string, number> {
  const numbered = new Set(series.filter((s) => s.numbered).map((s) => s.id));
  const counters = new Map<string, number>();
  const numbers = new Map<string, number>();
  const ordered = [...meetings].sort(
    (a, b) =>
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.slug.localeCompare(b.slug),
  );
  for (const meeting of ordered) {
    if (!meeting.series || !numbered.has(meeting.series)) continue;
    if (meeting.cancelledAt !== null) continue;
    const key = `${meeting.series}|${termOf(meeting.startsAt)}`;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    numbers.set(meeting.slug, next);
  }
  return numbers;
}

/** The title and kicker for one meeting; see `resolveMeetings`. */
export function deriveTitle(
  meeting: Pick<AuthoredMeeting, "title" | "agenda">,
  series: Series | undefined,
  number: number | undefined,
): { title: string; kicker: string | null } {
  if (meeting.title !== undefined) {
    // An authored title always wins; a topic night still carries its kicker.
    return {
      title: meeting.title,
      kicker: series?.headline === "topic" ? series.name : null,
    };
  }
  if (series === undefined) {
    throw new Error("A meeting with no series needs an authored title.");
  }
  const topics = topicsOf(meeting.agenda);
  if (series.headline === "topic") {
    return topics === null
      ? { title: series.name, kicker: null }
      : { title: topics, kicker: series.name };
  }
  let title = series.name;
  if (number !== undefined) title += ` #${number}`;
  if (meeting.agenda.length > 0) {
    title += `: ${topics ?? "Workshops"}`;
  }
  return { title, kicker: null };
}

/** Every meeting with its series applied. */
export function resolveMeetings(
  authored: AuthoredClubConfig,
  seriesList: readonly Series[],
): ClubConfig {
  const byId = new Map(seriesList.map((s) => [s.id, s]));
  const numbers = seriesNumbers(authored.meetings, seriesList);

  const meetings = authored.meetings.map((meeting): Meeting => {
    const series =
      meeting.series === undefined ? undefined : byId.get(meeting.series);
    if (meeting.series !== undefined && series === undefined) {
      throw new Error(
        `Meeting "${meeting.slug}" names unknown series "${meeting.series}".`,
      );
    }
    const { title, kicker } = deriveTitle(
      meeting,
      series,
      numbers.get(meeting.slug),
    );
    const category = meeting.category ?? series?.category;
    const summary = meeting.summary ?? series?.summary;
    const location = meeting.location ?? series?.location;
    if (
      category === undefined ||
      summary === undefined ||
      location === undefined
    ) {
      throw new Error(
        `Meeting "${meeting.slug}" has no category, summary or location.`,
      );
    }
    return {
      slug: meeting.slug,
      series: meeting.series ?? null,
      title,
      kicker,
      summary,
      category,
      brand: meeting.brand ?? series?.brand ?? "devdogs",
      building:
        meeting.building !== undefined
          ? meeting.building
          : (series?.building ?? null),
      location,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      rsvpUrl: meeting.rsvpUrl,
      cancelledAt: meeting.cancelledAt,
      cancellationReason: meeting.cancellationReason,
      countsForCredit: meeting.countsForCredit,
      surveyUrl: meeting.surveyUrl,
      ...(meeting.questions === undefined
        ? {}
        : { questions: meeting.questions }),
      agenda: meeting.agenda,
    };
  });

  return { meetings };
}
