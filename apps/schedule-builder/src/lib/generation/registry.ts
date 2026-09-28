import type { ScheduleRule } from "./rule";
import { campus } from "./rules/campus";
import { maxCreditHoursRule, minCreditHoursRule } from "./rules/creditHours";
import { excludedCourses } from "./rules/excludedCourses";
import { excludedSections } from "./rules/excludedSections";
import {
  preferredEndTimeRule,
  preferredStartTimeRule,
} from "./rules/preferredTimeWindow";

/**
 * The active rule set. This is the single integration point for the whole
 * engine: adding a feature means writing a rule module and appending it here —
 * never editing engine.ts. The engine reads every rule's hooks from this array
 * (the always-on no-conflicts invariant is the one exception; it lives in the
 * engine directly because it is not optional).
 */
export const RULES: ScheduleRule[] = [
  // Hard, per-section identity filters.
  excludedCourses,
  excludedSections,
  campus,
  // Hard credit-hour bounds: max prunes partials (monotonic), min validates only
  // complete schedules.
  maxCreditHoursRule,
  minCreditHoursRule,
  // Hard time-of-day window, per section.
  preferredStartTimeRule,
  preferredEndTimeRule,
];
