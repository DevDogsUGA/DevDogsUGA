/**
 * The shared Section/Meeting domain model. Both schedule generation and
 * display consume this shape — treat it as a contract: changing a field here
 * ripples into every downstream package.
 */

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DateRange {
  start: string;
  end: string;
}

export interface BuildingLocation {
  code: string;
  description: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * `quality` is always `null` — it is a dormant seam. There is no rating
 * source since RateMyProfessors was removed; downstream code should keep
 * reading this field so a future rating source can be wired back in without
 * a contract change.
 */
export interface Professor {
  name: string;
  quality: number | null;
}

export interface Meeting {
  days: DayOfWeek[];
  startTime: string | null;
  endTime: string | null;
  building: BuildingLocation | null;
  room: string | null;
}

export interface Section {
  crn: number;
  courseAbbr: string;
  courseNumber: string;
  courseTitle: string;
  creditHours: { min: number; max: number };
  campus: { id: number; abbr: string; description: string };
  professor: Professor | null;
  seatsAvailable: number;
  actualEnrollment: number;
  maximumEnrollment: number;
  cancelled: boolean;
  lastSeenAt: Date;
  academicPeriod: number;
  /**
   * From `partsOfTerm.classesBegin`/`classesEnd` via
   * `offerings.(academicPeriod, partOfTerm)`. Nullable only to cover a
   * should-be-impossible missing join — every offering references a real
   * part of term, so a `null` here means the join failed to find its match,
   * not that the row style makes it optional.
   */
  dateRange: DateRange | null;
  meetings: Meeting[];
}
