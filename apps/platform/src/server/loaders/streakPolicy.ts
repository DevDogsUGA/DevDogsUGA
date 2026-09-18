import { clubDay } from "~/lib/eventTime";

export interface StreakSummary {
  current: number;
  longest: number;
  thisWeekEarned: number;
  thisWeekRequired: number;
}

export function clubWeekKey(at: Date): string {
  const { year, month, day } = clubDay(at);
  const date = new Date(Date.UTC(year, month, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function calculateStreak(
  opportunityStarts: Date[],
  earnedStarts: Date[],
  now = new Date(),
): StreakSummary {
  const currentWeek = clubWeekKey(now);
  const opportunities = countsByWeek(
    opportunityStarts.filter(
      (at) => at <= now || clubWeekKey(at) === currentWeek,
    ),
  );
  const earned = countsByWeek(earnedStarts.filter((at) => at <= now));
  const weeks = [...opportunities.keys()].sort();
  let longest = 0;
  let running = 0;
  for (const week of weeks) {
    const required = Math.min(2, opportunities.get(week) ?? 0);
    const complete = (earned.get(week) ?? 0) >= required;
    if (complete) {
      running += 1;
      longest = Math.max(longest, running);
    } else if (week !== currentWeek) {
      running = 0;
    }
  }
  return {
    current: running,
    longest,
    thisWeekEarned: earned.get(currentWeek) ?? 0,
    thisWeekRequired: Math.min(2, opportunities.get(currentWeek) ?? 0),
  };
}

function countsByWeek(starts: Date[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const start of starts) {
    const week = clubWeekKey(start);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}
