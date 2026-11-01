import {
  addDays,
  clubDateKey,
  clubWeekStart,
  mondayOf,
} from "@devdogsuga/events";

/**
 * The weekly streak (Q86-Q97, Q165, Q173), as a pure function.
 *
 * Weeks run Monday to Sunday in Athens time, each named by its Monday. A week
 * QUALIFIES (lights) when the member either attended a meeting that links a
 * workshop definition or authored a commit in it (on the default branch of a
 * repository the platform syncs). Nothing else counts: not a plain meeting
 * (Merge Monday, a social), and not EL evidence or a reflection.
 *
 * Monday is the grace day. Activity on the Monday that follows a week may
 * count for that week, until 11:59 PM that Monday (Athens time). Each piece of
 * activity counts once: it rescues the previous week only if that week had no
 * qualifying activity of its own and had meetings, otherwise it counts toward
 * the week it happened in.
 *
 * Streak Freeze is automatic. A week with no meetings is frozen: it neither
 * extends a streak nor breaks one, and asks nothing of the member. A commit in
 * such a week still lights it (and, being lit, extends the streak by one).
 */

/**
 * - `lit`: the week qualified.
 * - `dark`: it had meetings, did not qualify, and its grace day is over.
 * - `open`: it had meetings, has not qualified, and can still (this week, the
 *   week after it started if today is its grace Monday, or a future week).
 * - `no-meeting`: no meetings, no qualifying activity: a Streak Freeze.
 */
export type WeekState = "lit" | "dark" | "open" | "no-meeting";

export interface WeeklyStreakInput {
  /** Start instants of the live (not cancelled, not deleted) meetings of any kind. */
  meetings: readonly Date[];
  /**
   * Qualifying activity: the start of each workshop meeting attended, and the
   * commit time of each default-branch commit.
   */
  activity: readonly Date[];
  now: Date;
}

export interface WeeklyStreak {
  /** The state of every week from the first meeting or activity to now. */
  readonly states: ReadonlyMap<string, WeekState>;
  /** A week's state; weeks outside the range have no meetings, so are frozen. */
  stateOf(week: string): WeekState;
  /** Consecutive qualifying weeks up to now; frozen and still-open weeks neither add nor break. */
  readonly current: number;
  readonly longest: number;
}

interface Item {
  day: string;
  week: string;
  used: boolean;
}

export function computeWeeklyStreak(input: WeeklyStreakInput): WeeklyStreak {
  const today = clubDateKey(input.now);
  const currentWeek = mondayOf(today);
  const meetingWeeks = new Set(input.meetings.map((at) => clubWeekStart(at)));
  const items: Item[] = input.activity
    .filter((at) => at.getTime() <= input.now.getTime())
    .map((at) => ({
      day: clubDateKey(at),
      week: clubWeekStart(at),
      used: false,
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const states = new Map<string, WeekState>();
  const known = [...meetingWeeks, ...items.map((i) => i.week), currentWeek];
  const first = known.reduce((a, b) => (a < b ? a : b));
  const last = known.reduce((a, b) => (a > b ? a : b));

  let current = 0;
  let longest = 0;
  for (let week = first; week <= last; week = addDays(week, 7)) {
    const hasMeetings = meetingWeeks.has(week);
    const own = items.filter((i) => i.week === week && !i.used);
    let lit = own.length > 0;
    if (!lit && hasMeetings) {
      const grace = addDays(week, 7);
      const rescue = items.find((i) => i.day === grace && !i.used);
      if (rescue) {
        rescue.used = true;
        lit = true;
      }
    }
    // A week is over once its grace Monday has passed.
    const closed = today > addDays(week, 7);
    let state: WeekState;
    if (lit) state = "lit";
    else if (!hasMeetings) state = "no-meeting";
    else state = closed ? "dark" : "open";
    states.set(week, state);

    if (state === "lit") {
      current += 1;
      longest = Math.max(longest, current);
    } else if (state === "dark") {
      current = 0;
    }
  }

  return {
    states,
    stateOf: (week) => states.get(week) ?? "no-meeting",
    current,
    longest,
  };
}
