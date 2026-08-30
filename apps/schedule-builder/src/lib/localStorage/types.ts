/** Canonical shape shared by useDraftCourses, SavedCourseItem, and CourseSectionsDialog. */
export type DraftCourse = {
  id: string;
  courseId: number;
  excludedCrns: number[];
  /**
   * `userPlanDraftCourses.courseId` is a to-one FK, so the PostgREST embed
   * returns a single object (null when the row is missing), not an array.
   */
  courses: { abbr: string; courseNumber: string; title: string } | null;
};

/** Canonical shape shared by useSavedPlans and plans/page. */
export type SavedPlan = {
  id: string;
  userId?: string;
  academicPeriod: number;
  title: string;
  crns: number[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Fields stored per-period in userPlanDrafts / localStorage draft prefs. */
export type DraftPrefs = {
  prefStartTime: string | null;
  prefEndTime: string | null;
  inputCampus: string | null;
  gapDay: string | null;
  minCreditHours: number;
  maxCreditHours: number;
  walking: boolean;
  showFilledClasses: boolean;
};
