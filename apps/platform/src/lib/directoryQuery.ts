import { COMMUNITY_PATH } from "~/lib/profilePath";

/**
 * The `/community` directory's query string, parsed and printed in one place
 * so the page, the terminal twin, the pager links and the loader agree on
 * what a valid query is. Everything arrives from the URL, so every field is
 * clamped: junk degrades to "no filter" rather than an error.
 */

/** Cards per page: a multiple of 1, 2 and 3 so every grid column count fills. */
export const DIRECTORY_PAGE_SIZE = 24;

const MAX_QUERY_LENGTH = 64;
const MAX_MAJOR_LENGTH = 200;
const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

export interface DirectoryQuery {
  /** Name or handle fragment. Empty means no search. */
  q: string;
  /** Only members holding a leadership role. */
  leadership: boolean;
  /** An exact major name, or null. */
  major: string | null;
  /** A graduation year, or null. */
  year: number | null;
  /** 1-based, not yet clamped to the result count. */
  page: number;
}

type Raw = string | string[] | undefined | null;

function first(value: Raw): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

/** Accepts a `URLSearchParams` or the `searchParams` object a page receives. */
export function parseDirectoryQuery(
  input: URLSearchParams | Record<string, Raw>,
): DirectoryQuery {
  const get = (key: string): string | undefined =>
    input instanceof URLSearchParams
      ? (input.get(key) ?? undefined)
      : first(input[key]);

  const q = (get("q") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();

  const major = (get("major") ?? "").trim().slice(0, MAX_MAJOR_LENGTH);

  const rawYear = get("year");
  const year =
    rawYear && /^\d{4}$/.test(rawYear) ? Number.parseInt(rawYear, 10) : null;

  const rawPage = get("page");
  const page =
    rawPage && /^\d{1,6}$/.test(rawPage)
      ? Math.max(1, Number.parseInt(rawPage, 10))
      : 1;

  return {
    q,
    leadership: get("leadership") === "1",
    major: major || null,
    year: year !== null && year >= MIN_YEAR && year <= MAX_YEAR ? year : null,
    page,
  };
}

/** True when any search or filter narrows the list (the page number does not). */
export function isFiltered(query: DirectoryQuery): boolean {
  return (
    query.q !== "" ||
    query.leadership ||
    query.major !== null ||
    query.year !== null
  );
}

/** The directory's URL for a query, omitting defaults so links stay canonical. */
export function directoryHref(
  query: DirectoryQuery,
  page = query.page,
): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.leadership) params.set("leadership", "1");
  if (query.major) params.set("major", query.major);
  if (query.year !== null) params.set("year", String(query.year));
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${COMMUNITY_PATH}?${qs}` : COMMUNITY_PATH;
}

/**
 * Escapes `\`, `%` and `_` so a typed fragment matches literally inside a
 * `LIKE`/`ILIKE ... ESCAPE '\'` pattern. Without it, searching "100%" or "a_b"
 * would act as a wildcard.
 */
export function escapeLike(fragment: string): string {
  return fragment.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** The page clamped into 1..totalPages, and the row offset for it. */
export function pageBounds(
  requestedPage: number,
  total: number,
  pageSize = DIRECTORY_PAGE_SIZE,
): { page: number; totalPages: number; offset: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, totalPages, offset: (page - 1) * pageSize };
}

/**
 * "Computer Science, Linguistics · Class of 2030" from the two public academic
 * fields, or null when the member has neither.
 */
export function academicsLine(profile: {
  majors: readonly string[];
  graduationYear: number | null;
}): string | null {
  const parts = [
    profile.majors.join(", "),
    profile.graduationYear === null ? "" : `Class of ${profile.graduationYear}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
