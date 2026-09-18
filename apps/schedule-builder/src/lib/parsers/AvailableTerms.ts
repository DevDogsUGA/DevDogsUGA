import Papa from "papaparse";
import type { Row } from "./types";
import { academicPeriodInfo } from "./utils";

const SEMESTERS = ["spring", "summer", "fall"] as const;

export type AvailableTerm = {
  academicPeriod: number;
  description: string;
  rows: Row[];
};

export type FailedFetch = {
  semester: string;
  status?: number;
  error?: string;
};

export type AvailableTermsResult = {
  terms: AvailableTerm[];
  failedFetches: FailedFetch[];
};

/** Thrown by `fetchSemesterCsv` for a non-ok HTTP response, carrying the status. */
export class SemesterFetchError extends Error {
  constructor(
    readonly semester: string,
    readonly status: number,
  ) {
    super(`Failed to fetch ${semester}.csv: HTTP ${status}`);
    this.name = "SemesterFetchError";
  }
}

/**
 * Fetches and parses one semester's CSV.
 *
 * Throws (rather than returning a falsy value) on a non-ok response or a
 * network-level failure, so the caller can tell "this semester's fetch
 * failed" apart from "this semester's CSV parsed but had no usable
 * ACADEMIC_PERIOD" (returned as `null`) — the registrar sometimes publishes an
 * empty CSV ahead of a term opening, which is not itself an error.
 */
export async function fetchSemesterCsv(
  semester: string,
): Promise<AvailableTerm | null> {
  const res = await fetch(`https://apps.reg.uga.edu/soc/${semester}.csv`);
  if (!res.ok) throw new SemesterFetchError(semester, res.status);

  const rows = Papa.parse<Row>(await res.text(), {
    header: true,
    skipEmptyLines: true,
  }).data;

  const academicPeriod = parseInt(rows[0]?.ACADEMIC_PERIOD ?? "", 10);
  if (isNaN(academicPeriod)) return null;

  return {
    academicPeriod,
    description: academicPeriodInfo(academicPeriod).description,
    rows,
  };
}

// Mirrors the "Spring 2026 / Summer 2026 / Fall 2026" term-selector pills on
// https://reg.uga.edu/registration/schedule-of-classes/
// Those pills are populated by reading ACADEMIC_PERIOD off of these same
// three CSVs.
//
// A semester's fetch failing (non-ok response or a thrown network error) is
// surfaced in `failedFetches` rather than silently skipped: a renamed/moved
// CSV used to `continue` past this exact case and still return `ok: true`
// with the remaining terms, hiding the fact that a whole term went stale.
export async function detectAvailableTerms(): Promise<AvailableTermsResult> {
  const terms: AvailableTerm[] = [];
  const failedFetches: FailedFetch[] = [];

  for (const semester of SEMESTERS) {
    try {
      const term = await fetchSemesterCsv(semester);
      if (term) terms.push(term);
    } catch (err) {
      failedFetches.push({
        semester,
        status: err instanceof SemesterFetchError ? err.status : undefined,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { terms, failedFetches };
}
