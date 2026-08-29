export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

/** A single meeting slot for a section (maps to Java Class record). */
export interface AlgorithmClass {
  crn: number;
  days: DayOfWeek[];
  /** "HH:mm" 24-hour format */
  startTime: string;
  /** "HH:mm" 24-hour format */
  endTime: string;
  buildingName: string;
  campus: string;
  buildingNumber: string;
  latitude?: number;
  longitude?: number;
}

export interface Professor {
  name: string;
  quality: number;
}

export interface AlgorithmSection {
  courseCode: string;
  crn: number;
  professor: Professor;
  classes: AlgorithmClass[];
  /**
   * Credit-hour range for the section's course. Variable-credit courses have
   * min < max, so a schedule's total is a range rather than a single number.
   */
  creditHours: { min: number; max: number };
}

export interface AlgorithmCourse {
  courseCode: string;
  sections: AlgorithmSection[];
}

export interface HConstraints {
  /** Course codes to drop entirely before generating. */
  excludedCourses: string[];
  /** Section CRNs to drop before generating. */
  excludedSections: number[];
  campus: string;
  /** 0 means "no lower bound". */
  minCreditHours: number;
  /** 0 means "no upper bound". */
  maxCreditHours: number;
  /** Require consecutive classes to be walkable within the gap between them. */
  walking: boolean;
}

export interface SConstraints {
  /** undefined means no gap-day preference */
  gapDay?: DayOfWeek;
  /** "HH:mm" — earliest acceptable start time */
  prefStartTime?: string;
  /** "HH:mm" — latest acceptable end time for the last class */
  prefEndTime?: string;
  showFilledClasses: boolean;
}
