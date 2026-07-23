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
}

export interface AlgorithmCourse {
  courseCode: string;
  sections: AlgorithmSection[];
}

export interface HConstraints {
  excludedCourses: AlgorithmCourse[];
  excludedSections: AlgorithmSection[];
  campus: string;
  minCreditHours: number;
  maxCreditHours: number;
  walking: boolean;
}

export interface SConstraints {
  /** undefined means no gap-day preference */
  gapDay?: DayOfWeek;
  /** "HH:mm" — earliest acceptable start time */
  prefStartTime?: string;
  /** "HH:mm" — latest acceptable start time for last class */
  prefEndTime?: string;
  showFilledClasses: boolean;
}
