import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import type { ScheduleRule } from "../rule";

/**
 * Soft time-of-day preferences: how well a complete schedule's earliest
 * start and latest end line up with the user's preferred start/end times.
 *
 * Ported from the old engine's `computeStartTime`/`computeEndTime`/
 * `normalizeValue` (`../../algorithm/schedule-util.ts`), rebuilt against the
 * `Section`/`Meeting` domain model instead of the legacy `Schedule` type.
 * The old code normalized against a fixed 8am-9pm clock window and used
 * `prefStartTime`/`prefEndTime` only to decide whether the term applied at
 * all — the actual preferred time never bent the curve, because enforcement
 * really happened via a separate hard pre-filter (see the regression note
 * below). Here, with that pre-filter gone, the preferred time itself is one
 * of the normalization bounds, so the score actually rewards clearing it.
 *
 * Gap-day preference (`computeGapDay` in the old file) is dropped entirely —
 * there is no replacement rule for it in this package.
 *
 * IMPORTANT — this is an intentional behavior change from the old algorithm.
 * `../../algorithm/brute-force.ts`'s `getValidSections` used to HARD-exclude
 * any section whose class started before `prefStartTime` or ended after
 * `prefEndTime` *before* the search ever ran, silently shrinking the whole
 * candidate pool to only preferred sections — a real, schedulable set of
 * courses could come back as "no valid schedules" just because one course's
 * only section met a few minutes outside the window. These rules replace
 * that hard pre-filter with a pure `score()`: neither defines
 * `allowSection`, `allowPartialSchedule`, nor `allowSchedule`, so the engine
 * can never reject a schedule for having an out-of-preference section — it
 * is still generated, just scored lower than one that better matches the
 * preference.
 */

/** Minutes from midnight to the end of the day, used as the "as late as
 * possible" end of the end-time preference's normalization range. */
const MINUTES_PER_DAY = 24 * 60;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Same shape as the old `schedule-util.ts` helper, plus a guard for a
 * degenerate `min === max` window (e.g. a "00:00" start preference, which
 * would otherwise divide by zero) so it clamps to 0/1 instead of `NaN`.
 */
function normalizeValue(value: number, min: number, max: number): number {
  if (max <= min) return value >= max ? 1 : 0;
  if (value < min) return 0;
  if (value > max) return 1;
  return (value - min) / (max - min);
}

/**
 * Earliest meeting start time across every section, in minutes since
 * midnight. `null` when no section has a timed meeting to score against.
 */
function earliestStartMinutes(sections: Section[]): number | null {
  let earliest: number | null = null;
  for (const section of sections) {
    for (const meeting of section.meetings) {
      if (meeting.startTime === null) continue;
      const t = timeToMinutes(meeting.startTime);
      if (earliest === null || t < earliest) earliest = t;
    }
  }
  return earliest;
}

/**
 * Latest meeting end time across every section, in minutes since midnight.
 * Deliberately reads `endTime`, not `startTime` — the end-time preference is
 * about when class actually lets out, not when the last class of the day
 * begins, so a class that starts early but runs long is judged by when it
 * ends. `null` when no section has a timed meeting to score against.
 */
function latestEndMinutes(sections: Section[]): number | null {
  let latest: number | null = null;
  for (const section of sections) {
    for (const meeting of section.meetings) {
      if (meeting.endTime === null) continue;
      const t = timeToMinutes(meeting.endTime);
      if (latest === null || t > latest) latest = t;
    }
  }
  return latest;
}

/**
 * Rewards a schedule whose earliest meeting starts at or after
 * `prefStartTime`: 1 once the schedule clears the preference, ramping down
 * toward 0 the earlier its first class starts before then. A schedule with
 * no timed meetings at all scores a neutral 1 — there is nothing to
 * penalize. Purely a score: never excludes a schedule or a section.
 */
export const preferredStartTimeRule: ScheduleRule = {
  isActive: (ctx: GenerationConstraints) => ctx.prefStartTime !== undefined,
  score(complete: Section[], ctx: GenerationConstraints): number {
    const earliest = earliestStartMinutes(complete);
    if (earliest === null) return 1;
    const prefMinutes = timeToMinutes(ctx.prefStartTime ?? "00:00");
    return normalizeValue(earliest, 0, prefMinutes);
  },
};

/**
 * Rewards a schedule whose latest meeting ends at or before `prefEndTime`: 1
 * once the schedule clears the preference, ramping down toward 0 the later
 * its last class ends after then. A schedule with no timed meetings at all
 * scores a neutral 1 — there is nothing to penalize. Purely a score: never
 * excludes a schedule or a section.
 */
export const preferredEndTimeRule: ScheduleRule = {
  isActive: (ctx: GenerationConstraints) => ctx.prefEndTime !== undefined,
  score(complete: Section[], ctx: GenerationConstraints): number {
    const latest = latestEndMinutes(complete);
    if (latest === null) return 1;
    const prefMinutes = timeToMinutes(ctx.prefEndTime ?? "24:00");
    return 1 - normalizeValue(latest, prefMinutes, MINUTES_PER_DAY);
  },
};
