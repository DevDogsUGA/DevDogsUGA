/**
 * The `ctx` passed to every rule hook (see `rule.ts`) and to `generateSchedules`
 * itself. This is the full set of user-facing generation inputs — modelled on
 * the current engine's `HConstraints`/`SConstraints`
 * (`../algorithm/types.ts`), minus the fields the redesign drops entirely:
 * `gapDay`, `walking`, and idle-time preferences have no field here. Distance
 * and gap-day return later, if at all, as their own dormant rule(s) reading
 * whatever field they need — they are not part of this shared contract.
 *
 * Every rule package builds against this shape, so a field added here is a
 * breaking change to all five rule packages, not just the engine.
 */
export interface GenerationConstraints {
  /** Course codes to drop entirely before generating. */
  excludedCourses: string[];
  /** Section CRNs to drop before generating. */
  excludedSections: number[];
  /** `Section.campus.id` to require, when the user has picked one campus. */
  campusId?: number;
  /** 0 means "no lower bound". */
  minCreditHours: number;
  /** 0 means "no upper bound". */
  maxCreditHours: number;
  /** Whether sections with no open seats may still be offered. */
  showFilledClasses: boolean;
  /** "HH:MM", the earliest acceptable start time. */
  prefStartTime?: string;
  /** "HH:MM", the latest acceptable end time for the last class. */
  prefEndTime?: string;
}
