import type { InferSelectModel } from "drizzle-orm";
import type * as schema from "~/server/db/schema";

export type Subject = InferSelectModel<typeof schema.subjects>;
export type College = InferSelectModel<typeof schema.colleges>;
export type Department = InferSelectModel<typeof schema.departments>;
export type Building = InferSelectModel<typeof schema.buildings>;
export type Campus = InferSelectModel<typeof schema.campuses>;
export type ScheduleType = InferSelectModel<typeof schema.scheduleTypes>;
export type Term = InferSelectModel<typeof schema.terms>;
export type PartOfTerm = InferSelectModel<typeof schema.partsOfTerm>;
export type Instructor = InferSelectModel<typeof schema.instructors>;
export type Course = InferSelectModel<typeof schema.courses>;
export type CourseDetails = InferSelectModel<typeof schema.courseDetails>;
export type Offering = InferSelectModel<typeof schema.offerings>;
export type Meeting = InferSelectModel<typeof schema.meetings>;
