/**
 * One course offering (section) for the current term, joined with its course
 * and instructor. Sourced by querying the base `offerings`/`courses`/
 * `instructors` tables directly (there is no search matview).
 */
export interface SectionRow {
  crn: number;
  courseId: number;
  abbr: string;
  courseNumber: string;
  title: string;
  maxCreditHours: number;
  firstName: string | null;
  lastName: string | null;
  seatsAvailable: number;
  cancelled: boolean;
}

/** A course the user can add, identified for the draft-course upsert flow. */
export interface CourseOption {
  courseId: number;
  abbr: string;
  courseNumber: string;
  title: string;
  maxCreditHours: number;
}
