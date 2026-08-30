import Papa from "papaparse";
import type { Row } from "./types";
import { academicPeriodInfo } from "./utils";

const SEMESTERS = ["spring", "summer", "fall"] as const;

export type AvailableTerm = {
  academicPeriod: number;
  description: string;
  rows: Row[];
};

// Mirrors the "Spring 2026 / Summer 2026 / Fall 2026" term-selector pills on
// https://reg.uga.edu/registration/schedule-of-classes/
// Those pills are populated by reading ACADEMIC_PERIOD off of these same
// three CSVs.
export async function detectAvailableTerms(): Promise<AvailableTerm[]> {
  const results: AvailableTerm[] = [];

  for (const semester of SEMESTERS) {
    const res = await fetch(`https://apps.reg.uga.edu/soc/${semester}.csv`);
    if (!res.ok) continue;

    const rows = Papa.parse<Row>(await res.text(), {
      header: true,
      skipEmptyLines: true,
    }).data;

    const academicPeriod = parseInt(rows[0]?.ACADEMIC_PERIOD ?? "", 10);
    if (isNaN(academicPeriod)) continue;

    results.push({
      academicPeriod,
      description: academicPeriodInfo(academicPeriod).description,
      rows,
    });
  }

  return results;
}
