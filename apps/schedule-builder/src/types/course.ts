export interface CourseClass {
  days: string;
  startTime?: string;
  endTime?: string;
}

export interface CourseSection {
  crn: number;
  professor?: {
    firstName?: string;
    lastName?: string;
  };
  classes?: CourseClass[];
}

export interface Course {
  courseId: number;
  subject?: string;
  courseNumber?: string;
  title?: string;
  athenaTitle?: string;
  courseSections?: CourseSection[];
}

/** A row from the `offeringSearch` view: one course offering (section). */
export interface OfferingSearchRow {
  crn: number;
  courseId: number;
  abbr: string;
  courseNumber: string;
  title: string;
  maxCreditHours: number;
  firstName: string | null;
  lastName: string | null;
  seatsAvailable: number;
  active: boolean;
}
