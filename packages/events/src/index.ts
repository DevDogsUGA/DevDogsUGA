import badges from "./data/badges.json" with { type: "json" };
import meetings from "./data/meetings.json" with { type: "json" };
import questions from "./data/questions.json" with { type: "json" };
import series from "./data/series.json" with { type: "json" };
import venues from "./data/venues.json" with { type: "json" };
import workshops from "./data/workshops.json" with { type: "json" };
import {
  badgesConfigSchema,
  validateBadges,
  type BadgesConfig,
} from "./badges.js";
import { questionsConfigSchema, type QuestionsConfig } from "./questions.js";
import { resolveMeetings } from "./resolve.js";
import { clubConfigSchema, type ClubConfig } from "./schema.js";
import { seriesConfigSchema, type SeriesConfig } from "./series.js";
import {
  validateAuthored,
  validateCatalog,
  validateClubConfig,
  type ValidationIssue,
} from "./validator.js";
import { venuesConfigSchema, type VenuesConfig } from "./venues.js";
import { workshopsConfigSchema, type WorkshopsConfig } from "./workshops.js";

export * from "./answers.js";
export * from "./badges.js";
export * from "./questions.js";
export * from "./resolve.js";
export * from "./schema.js";
export * from "./series.js";
export * from "./validator.js";
export * from "./venues.js";
export * from "./workshops.js";

export class ClubConfigError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      `${issues.length} events ${issues.length === 1 ? "issue" : "issues"} found:\n` +
        issues
          .map((issue) => `  [${issue.id}] ${issue.code}: ${issue.message}`)
          .join("\n"),
    );
    this.name = "ClubConfigError";
  }
}

/**
 * Parses and validates the committed data files, throwing a readable
 * `ClubConfigError` if either step fails.
 *
 * This is the ONE function most callers want. `check.ts` (the CI gate) and
 * `server/config/reconcile.ts` (the platform's runtime reader) both go
 * through it, so a config that is broken in either dimension -- wrong shape,
 * or right shape but unpublishable -- is refused identically wherever it is
 * read, rather than reconcile trusting a file CI would have rejected.
 */
export function getClubConfig(): ClubConfig {
  return getConfigFiles().meetings;
}

/** The survey's questions, validated with the meetings that list them. */
export function getQuestions(): QuestionsConfig {
  return getConfigFiles().questions;
}

/** The series meetings reference, from `series.json`. */
export function getSeries(): SeriesConfig {
  return getConfigFiles().series;
}

/** The reusable workshops meeting agendas reference, from `workshops.json`. */
export function getWorkshops(): WorkshopsConfig {
  return getConfigFiles().workshops;
}

/** The badge definitions, from `badges.json`. */
export function getBadges(): BadgesConfig {
  return parseBadges(badges);
}

/** Parses and validates a badges file, throwing a readable error. */
export function parseBadges(raw: unknown): BadgesConfig {
  const parsed = badgesConfigSchema.parse(raw);
  const issues = validateBadges(parsed);
  if (issues.length > 0) {
    throw new Error(
      `badges.json: ${issues.map((i) => `[${i.id}] ${i.message}`).join(" ")}`,
    );
  }
  return parsed;
}

/** The venue catalog meetings and series reference, from `venues.json`. */
export function getVenues(): VenuesConfig {
  return getConfigFiles().venues;
}

function getConfigFiles(): {
  meetings: ClubConfig;
  questions: QuestionsConfig;
  series: SeriesConfig;
  workshops: WorkshopsConfig;
  venues: VenuesConfig;
} {
  // A static import, never a read from disk: a bundler inlines it, and the
  // platform calls this from a Cloudflare Worker, which has no filesystem to
  // read `dist/` from. The data file sits under `src/` so `tsc` copies it into
  // `dist/` beside the module that imports it.
  return parseConfigFiles(meetings, questions, series, workshops, venues);
}

/** The same validation `getClubConfig` runs, over an in-memory value rather
 * than the committed files -- what `check.ts` and this package's own tests
 * use to exercise malformed input. Without `rawSeries` no series exist, so
 * every meeting must stand alone. */
export function parseClubConfig(
  raw: unknown,
  rawSeries: unknown = { series: [] },
  rawWorkshops: unknown = { workshops: [] },
  rawVenues: unknown = { venues: [] },
): ClubConfig {
  return parseConfigFiles(
    raw,
    { questions: [] },
    rawSeries,
    rawWorkshops,
    rawVenues,
  ).meetings;
}

/** The files, each parsed, the series applied, then validated together. */
export function parseConfigFiles(
  rawMeetings: unknown,
  rawQuestions: unknown,
  rawSeries: unknown = { series: [] },
  rawWorkshops: unknown = { workshops: [] },
  rawVenues: unknown = { venues: [] },
): {
  meetings: ClubConfig;
  questions: QuestionsConfig;
  series: SeriesConfig;
  workshops: WorkshopsConfig;
  venues: VenuesConfig;
} {
  const parsedAuthored = clubConfigSchema.parse(rawMeetings);
  const parsedQuestions = questionsConfigSchema.parse(rawQuestions);
  const parsedSeries = seriesConfigSchema.parse(rawSeries);
  const parsedWorkshops = workshopsConfigSchema.parse(rawWorkshops);
  const parsedVenues = venuesConfigSchema.parse(rawVenues);
  const authoredIssues = [
    ...validateCatalog(parsedWorkshops, parsedVenues),
    ...validateAuthored(
      parsedAuthored,
      parsedSeries,
      parsedWorkshops,
      parsedVenues,
    ),
  ];
  if (authoredIssues.length > 0) throw new ClubConfigError(authoredIssues);
  const parsedMeetings = resolveMeetings(parsedAuthored, parsedSeries.series, {
    workshops: parsedWorkshops.workshops,
    venues: parsedVenues.venues,
  });
  const issues = validateClubConfig(parsedMeetings, parsedQuestions);
  if (issues.length > 0) throw new ClubConfigError(issues);
  return {
    meetings: parsedMeetings,
    questions: parsedQuestions,
    series: parsedSeries,
    workshops: parsedWorkshops,
    venues: parsedVenues,
  };
}
