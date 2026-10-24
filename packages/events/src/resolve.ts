import type { Series } from "./series.js";
import type {
  AgendaEntry,
  AuthoredClubConfig,
  AuthoredMeeting,
  ClubConfig,
  Meeting,
  Workshop,
} from "./schema.js";
import { legacyPlace, type ResolvedVenue, type Venue } from "./venues.js";
import type { ResolvedWorkshop, WorkshopDefinition } from "./workshops.js";

/**
 * Applies `series.json`, `workshops.json` and `venues.json` to
 * `meetings.json`: the one place a meeting's title, category, brand, summary,
 * workshops and place are decided. Everything that shows a
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
function topicsOf(agenda: readonly Pick<Workshop, "title">[]): string | null {
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
  meeting: Pick<AuthoredMeeting, "title">,
  agenda: readonly Pick<Workshop, "title">[],
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
  const topics = topicsOf(agenda);
  if (series.headline === "topic") {
    return topics === null
      ? { title: series.name, kicker: null }
      : { title: topics, kicker: series.name };
  }
  let title = series.name;
  if (number !== undefined) title += ` #${number}`;
  if (agenda.length > 0) {
    title += `: ${topics ?? "Workshops"}`;
  }
  return { title, kicker: null };
}

/** The catalogs a meeting's references resolve against. */
export interface ResolveCatalog {
  workshops: readonly WorkshopDefinition[];
  venues: readonly Venue[];
}

/** An agenda's ids turned into workshops, with any per-night description. */
export function resolveAgenda(
  slug: string,
  agenda: readonly AgendaEntry[],
  workshops: ReadonlyMap<string, WorkshopDefinition>,
): ResolvedWorkshop[] {
  return agenda.map((entry) => {
    const id = typeof entry === "string" ? entry : entry.workshop;
    const definition = workshops.get(id);
    if (definition === undefined) {
      throw new Error(`Meeting "${slug}" runs unknown workshop "${id}".`);
    }
    return {
      id: definition.id,
      title: definition.title,
      description:
        typeof entry === "string" ? definition.description : entry.description,
      project: definition.project,
      elHours: definition.elHours,
      topics: definition.topics ?? [],
    };
  });
}

/**
 * A meeting's venue and room. The meeting's own venue wins over its series';
 * a meeting that names a venue does not inherit the series' room, which was
 * a room in some other place. A room alone overrides the series' room.
 */
export function resolveVenue(
  meeting: Pick<AuthoredMeeting, "slug" | "venue" | "room">,
  series: Series | undefined,
  venues: ReadonlyMap<string, Venue>,
): ResolvedVenue {
  const id = meeting.venue ?? series?.venue;
  if (id === undefined) {
    throw new Error(`Meeting "${meeting.slug}" has no venue.`);
  }
  const venue = venues.get(id);
  if (venue === undefined) {
    throw new Error(`Meeting "${meeting.slug}" names unknown venue "${id}".`);
  }
  const room =
    meeting.venue === undefined
      ? (meeting.room ?? series?.room ?? null)
      : (meeting.room ?? null);
  return { ...venue, room };
}

/** Every meeting with its series, workshops and venue applied. */
export function resolveMeetings(
  authored: AuthoredClubConfig,
  seriesList: readonly Series[],
  catalog: ResolveCatalog = { workshops: [], venues: [] },
): ClubConfig {
  const byId = new Map(seriesList.map((s) => [s.id, s]));
  const workshopsById = new Map(catalog.workshops.map((w) => [w.id, w]));
  const venuesById = new Map(catalog.venues.map((v) => [v.id, v]));
  const numbers = seriesNumbers(authored.meetings, seriesList);

  const meetings = authored.meetings.map((meeting): Meeting => {
    const series =
      meeting.series === undefined ? undefined : byId.get(meeting.series);
    if (meeting.series !== undefined && series === undefined) {
      throw new Error(
        `Meeting "${meeting.slug}" names unknown series "${meeting.series}".`,
      );
    }
    const agenda = resolveAgenda(meeting.slug, meeting.agenda, workshopsById);
    const { title, kicker } = deriveTitle(
      meeting,
      agenda,
      series,
      numbers.get(meeting.slug),
    );
    const category = meeting.category ?? series?.category;
    const summary = meeting.summary ?? series?.summary;
    if (category === undefined || summary === undefined) {
      throw new Error(`Meeting "${meeting.slug}" has no category or summary.`);
    }
    const venue = resolveVenue(meeting, series, venuesById);
    const { building, location } = legacyPlace(venue, venue.room);
    return {
      slug: meeting.slug,
      series: meeting.series ?? null,
      title,
      kicker,
      summary,
      category,
      brand: meeting.brand ?? series?.brand ?? "devdogs",
      venue,
      building,
      location,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      rsvpUrl: meeting.rsvpUrl,
      joinUrl: meeting.joinUrl ?? null,
      cancelledAt: meeting.cancelledAt,
      cancellationReason: meeting.cancellationReason,
      countsForCredit: meeting.countsForCredit,
      surveyUrl: meeting.surveyUrl,
      ...(meeting.questions === undefined
        ? {}
        : { questions: meeting.questions }),
      agenda,
    };
  });

  return { meetings };
}
