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
  cancelled: boolean;
}
