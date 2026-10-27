import { clubWeekStart } from "@devdogsuga/events";

export interface WeeklyMerges {
  /** Monday of the club week (`clubWeekStart`), `YYYY-MM-DD`. */
  week: string;
  merged: number;
}

/** Merge dates folded into club weeks, oldest week first. Pure. */
export function countMergesByWeek(mergedAt: readonly Date[]): WeeklyMerges[] {
  const counts = new Map<string, number>();
  for (const at of mergedAt) {
    const week = clubWeekStart(at);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([week, merged]) => ({ week, merged }));
}
