import type { InferSelectModel } from "drizzle-orm";
import type {
  buildings,
  courses,
  instructors,
  meetings,
  offerings,
  subjects,
} from "~/server/db/schema";

// ─── Raw DB row types (inferred from Drizzle schema) ─────────────────────────

export type DbOffering = InferSelectModel<typeof offerings>;
export type DbCourse = InferSelectModel<typeof courses>;
export type DbMeeting = InferSelectModel<typeof meetings>;
export type DbInstructor = InferSelectModel<typeof instructors>;
export type DbBuilding = InferSelectModel<typeof buildings>;
export type DbSubject = InferSelectModel<typeof subjects>;

/** Full offering record returned by a relational query for plan display. */
export type OfferingWithDetails = DbOffering & {
  course: DbCourse & { subject: DbSubject };
  instructor: DbInstructor | null;
  meetings: (DbMeeting & { building: DbBuilding | null })[];
};

// ─── Display types (used by WeekSchedule / DayClass) ─────────────────────────

/**
 * Flat display record expected by DayClass and WeekSchedule.
 * Computed by toWeekSchedule() in src/lib/schedule-display.ts from
 * PostgREST/Drizzle offering data.
 */
export interface ClassData {
  classTitle: string;
  className: string;
  description: string;
  locationLong: string;
  locationShort: string;
  prereq: string;
  coreq: string;
  professor: string;
  semester: string;

  credits: number;
  crn: number;
  openSeats: number;
  maxSeats: number;
  waitlist: number;

  bgColor: string;
  borderColor: string;

  timeStart: string;
  timeEnd: string;
  timeDifference: number | null;

  currentDay: string;
  otherTimes: [string, string, string];
}

export type DaySchedule = Record<string, ClassData[]>;
export type WeekSchedule = Record<string, ClassData[]>;
