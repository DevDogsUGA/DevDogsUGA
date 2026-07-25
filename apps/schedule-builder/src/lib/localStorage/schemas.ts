import { z } from "zod";

export const LocalPreferences = z
  .object({ currentAcademicPeriod: z.number().nullable() })
  .catch({ currentAcademicPeriod: null });

export type LocalPreferences = z.infer<typeof LocalPreferences>;

export const LocalDraftPrefs = z.object({
  prefStartTime: z.string().nullable().default(null),
  prefEndTime: z.string().nullable().default(null),
  inputCampus: z.string().nullable().default(null),
  gapDay: z.string().nullable().default(null),
  minCreditHours: z.number().default(12),
  maxCreditHours: z.number().default(18),
  walking: z.boolean().default(false),
  showFilledClasses: z.boolean().default(false),
});

export type LocalDraftPrefs = z.infer<typeof LocalDraftPrefs>;

export const LocalDraftPrefsMap = z
  .record(z.string(), LocalDraftPrefs)
  .catch({});

export type LocalDraftPrefsMap = z.infer<typeof LocalDraftPrefsMap>;

export const LocalDraftCourse = z.object({
  id: z.string(),
  courseId: z.number(),
  excludedCrns: z.array(z.number()),
  abbr: z.string(),
  courseNumber: z.string(),
  title: z.string(),
});

export type LocalDraftCourse = z.infer<typeof LocalDraftCourse>;

export const LocalDraftCoursesMap = z
  .record(z.string(), z.array(LocalDraftCourse))
  .catch({});

export type LocalDraftCoursesMap = z.infer<typeof LocalDraftCoursesMap>;

export const LocalSavedPlan = z.object({
  id: z.string(),
  academicPeriod: z.number(),
  title: z.string(),
  crns: z.array(z.number()),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalSavedPlan = z.infer<typeof LocalSavedPlan>;

export const LocalSavedPlans = z.array(LocalSavedPlan).catch([]);

export type LocalSavedPlans = z.infer<typeof LocalSavedPlans>;
