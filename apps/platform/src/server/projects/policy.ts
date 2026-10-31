import { reflectionWordCount } from "~/server/reflections/policy";

/**
 * The rules for projects and project reports that need no database, so the
 * forms, the actions and the tests share one copy. The database repeats the
 * hard ones as constraints (`platform.word_count`, ranges, shapes).
 */

/** Words a project report's reflection needs (Q113). */
export const REPORT_MINIMUM_WORDS = 100;
export const REPORT_MAX_HOURS = 200;
/** Hours are claimed in quarter hours, as the workshop allowances are. */
export const HOUR_STEP = 0.25;
/** The longest date range one report may cover. */
export const REPORT_MAX_DAYS = 366;
export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 1000;
export const PROJECT_MAX_REPOS = 10;
export const PROJECT_MAX_TAGS = 20;
export const PROJECT_TAG_MAX = 40;
export const REVIEW_NOTE_MAX = 1000;

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type RepoParse =
  { ok: true; repos: string[] } | { ok: false; message: string };

/**
 * Repositories as typed: one `owner/name` per line or comma-separated, or full
 * GitHub URLs. Duplicates (any case) collapse; an empty box is fine.
 */
export function parseRepos(input: string): RepoParse {
  const repos: string[] = [];
  for (const raw of input.split(/[\s,]+/u)) {
    const entry = raw
      .trim()
      .replace(/^https?:\/\/github\.com\//iu, "")
      .replace(/\.git$/iu, "")
      .replace(/\/+$/u, "");
    if (entry === "") continue;
    if (!REPO.test(entry)) {
      return {
        ok: false,
        message: `"${raw.trim()}" is not an owner/name repository.`,
      };
    }
    if (!repos.some((r) => r.toLowerCase() === entry.toLowerCase())) {
      repos.push(entry);
    }
  }
  if (repos.length > PROJECT_MAX_REPOS) {
    return {
      ok: false,
      message: `A project lists at most ${PROJECT_MAX_REPOS} repositories.`,
    };
  }
  return { ok: true, repos };
}

export function isQuarterHours(hours: number): boolean {
  return (
    Number.isFinite(hours) &&
    Math.abs(hours / HOUR_STEP - Math.round(hours / HOUR_STEP)) < 1e-9
  );
}

export function isDay(value: string): boolean {
  return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function dayNumber(value: string): number {
  return Math.round(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
}

export interface ReportDraft {
  startDate: string;
  endDate: string;
  hours: number;
  content: string;
  /** The commits the report cites, by SHA (Q38, Q119, Q120). */
  shas: string[];
}

export type ReportProblem =
  | "bad_dates"
  | "future"
  | "range_too_long"
  | "bad_hours"
  | "too_short"
  | "no_commits";

/**
 * Why a report cannot be submitted, or null. `today` is the Eastern day the
 * caller read, so this stays free of clocks.
 */
export function reportProblem(
  draft: ReportDraft,
  today: string,
): ReportProblem | null {
  if (
    !isDay(draft.startDate) ||
    !isDay(draft.endDate) ||
    draft.endDate < draft.startDate
  ) {
    return "bad_dates";
  }
  if (draft.endDate > today) return "future";
  if (
    dayNumber(draft.endDate) - dayNumber(draft.startDate) >=
    REPORT_MAX_DAYS
  ) {
    return "range_too_long";
  }
  if (
    !isQuarterHours(draft.hours) ||
    draft.hours <= 0 ||
    draft.hours > REPORT_MAX_HOURS
  ) {
    return "bad_hours";
  }
  if (reflectionWordCount(draft.content) < REPORT_MINIMUM_WORDS) {
    return "too_short";
  }
  if (draft.shas.length === 0) return "no_commits";
  return null;
}

export const REPORT_PROBLEM_MESSAGE: Record<ReportProblem, string> = {
  bad_dates: "Choose a start and end date, with the end on or after the start.",
  future: "The date range cannot end in the future.",
  range_too_long: "One report covers at most a year. Split it into two.",
  bad_hours: `Hours must be in quarter-hour steps, above 0 and no more than ${REPORT_MAX_HOURS}.`,
  no_commits: "Cite at least one of your commits as evidence.",
  too_short: `Write at least ${REPORT_MINIMUM_WORDS} words about what you did and learned.`,
};

/** The Eastern calendar day of an instant, as `YYYY-MM-DD`. */
export function easternDay(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return parts;
}

export type TagParse =
  { ok: true; tags: string[] } | { ok: false; message: string };

/**
 * Tags as typed, comma- or line-separated. They are trimmed and lowercased,
 * duplicates collapse, and an empty box is fine. The database repeats the
 * bounds in `validate_project_showcase`.
 */
export function parseTags(input: string): TagParse {
  const tags: string[] = [];
  for (const raw of input.split(/[,\n]+/u)) {
    const tag = raw.trim().replace(/\s+/gu, " ").toLowerCase();
    if (tag === "") continue;
    if (tag.length > PROJECT_TAG_MAX) {
      return {
        ok: false,
        message: `A tag is at most ${PROJECT_TAG_MAX} characters.`,
      };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > PROJECT_MAX_TAGS) {
    return {
      ok: false,
      message: `A project has at most ${PROJECT_MAX_TAGS} tags.`,
    };
  }
  return { ok: true, tags };
}

/** The name as stored: trimmed, inner whitespace collapsed. */
export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/gu, " ");
}

/** Why a name or description cannot be saved, or null. */
export function projectTextProblem(
  name: string,
  description: string,
): { field: "name" | "description"; message: string } | null {
  if (name.length < PROJECT_NAME_MIN || name.length > PROJECT_NAME_MAX) {
    return {
      field: "name",
      message: `Give the project a name of ${PROJECT_NAME_MIN} to ${PROJECT_NAME_MAX} characters.`,
    };
  }
  if (description.length > PROJECT_DESCRIPTION_MAX) {
    return {
      field: "description",
      message: `Keep the description under ${PROJECT_DESCRIPTION_MAX} characters.`,
    };
  }
  return null;
}

/** The first line of a commit message, the part GitHub shows in lists. */
export function commitTitle(message: string): string {
  return message.split("\n", 1)[0]!.trim();
}
