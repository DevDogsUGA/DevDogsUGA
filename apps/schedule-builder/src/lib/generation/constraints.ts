/**
 * The `ctx` passed to every rule hook (see `rule.ts`) and to `generateSchedules`
 * itself: the full set of user-facing generation inputs. A rule reads the
 * fields it needs and ignores the rest.
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
