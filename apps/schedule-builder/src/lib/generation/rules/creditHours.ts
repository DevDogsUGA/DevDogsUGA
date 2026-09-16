import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import type { ScheduleRule } from "../rule";

/**
 * Lowest total credit hours a list of sections can be worth: the sum of
 * each section's `creditHours.min`. Adding another section can only raise
 * this floor, never lower it -- that monotonicity is what makes it safe to
 * prune a partial schedule on (see `maxCreditHoursRule`).
 */
function creditHourFloor(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.creditHours.min, 0);
}

/**
 * Highest total credit hours a list of sections can be worth: the sum of
 * each section's `creditHours.max`. A partial schedule's ceiling can only
 * rise as more sections are added, so a schedule that fails the ceiling
 * check today might still pass it once complete -- which is why this is
 * only ever checked once, in `minCreditHoursRule.allowSchedule`.
 */
function creditHourCeiling(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + s.creditHours.max, 0);
}

/**
 * Enforces `ctx.maxCreditHours` (0 means "no upper bound") as a
 * partial-schedule prune: a partial is rejected the moment its cheapest
 * possible total -- every variable-credit section counted at its `min` --
 * already exceeds the cap.
 *
 * This is safe as `allowPartialSchedule` (per the MONOTONIC requirement
 * documented on `ScheduleRule.allowPartialSchedule`) because the floor only
 * ever goes up as more sections are added to the partial: once it's over
 * the cap, no amount of further additions can bring it back under, so
 * every schedule built from this partial is doomed too.
 */
export const maxCreditHoursRule: ScheduleRule = {
  isActive(ctx) {
    return ctx.maxCreditHours > 0;
  },

  allowPartialSchedule(partial: Section[], ctx: GenerationConstraints) {
    return creditHourFloor(partial) <= ctx.maxCreditHours;
  },
};

/**
 * Enforces `ctx.minCreditHours` (0 means "no lower bound") -- but only once
 * a schedule is complete, via `allowSchedule`. A partial sitting under the
 * floor might still reach it once more courses are added (each
 * variable-credit section could end up counted at its `max`), so this rule
 * deliberately does NOT define `allowPartialSchedule`: a minimum is exactly
 * the non-monotonic shape called out in `ScheduleRule.allowPartialSchedule`'s
 * doc comment -- false for every partial, satisfiable only once complete --
 * so it must never be used to prune a partial early.
 */
export const minCreditHoursRule: ScheduleRule = {
  isActive(ctx) {
    return ctx.minCreditHours > 0;
  },

  allowSchedule(complete: Section[], ctx: GenerationConstraints) {
    return creditHourCeiling(complete) >= ctx.minCreditHours;
  },
};
