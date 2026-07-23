/** Canonical shape shared by useDraftCourses, SavedCourseItem, and CourseSectionsDialog. */
export type DraftCourse = {
  id: string;
  courseId: number;
  excludedCrns: number[];
  courses: { abbr: string; courseNumber: string; title: string }[];
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
