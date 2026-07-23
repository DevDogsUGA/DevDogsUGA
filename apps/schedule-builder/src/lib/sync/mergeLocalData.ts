import { supabase } from "~/supabase/client";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import {
  LocalPreferences,
  LocalDraftPrefsMap,
  LocalDraftCoursesMap,
  LocalSavedPlans,
} from "~/lib/localStorage/schemas";
import { readLocal, clearLocal } from "~/lib/localStorage/storage";

export async function runLocalDataMerge(userId: string): Promise<void> {
  const localPrefs = readLocal(LOCAL_KEYS.preferences, LocalPreferences);
  const localDraftPrefsMap = readLocal(LOCAL_KEYS.draftPrefs, LocalDraftPrefsMap);
  const localDraftCoursesMap = readLocal(
    LOCAL_KEYS.draftCourses,
    LocalDraftCoursesMap,
  );
  const localSavedPlans = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);

  const hasData =
    localPrefs.currentAcademicPeriod !== null ||
    Object.keys(localDraftPrefsMap).length > 0 ||
    Object.keys(localDraftCoursesMap).length > 0 ||
    localSavedPlans.length > 0;

  if (!hasData) return;

  await Promise.allSettled([
    mergePreferences(userId, localPrefs),
    mergeDraftPrefs(userId, localDraftPrefsMap),
    mergeDraftCourses(userId, localDraftCoursesMap),
    mergeSavedPlans(userId, localSavedPlans),
  ]);

  clearLocal(LOCAL_KEYS.preferences);
  clearLocal(LOCAL_KEYS.draftPrefs);
  clearLocal(LOCAL_KEYS.draftCourses);
  clearLocal(LOCAL_KEYS.savedPlans);
}

async function mergePreferences(
  userId: string,
  local: LocalPreferences,
): Promise<void> {
  if (local.currentAcademicPeriod === null) return;
  try {
    const { data } = await supabase
      .from("userPreferences")
      .select("currentAcademicPeriod")
      .eq("userId", userId)
      .maybeSingle();

    if (!data || data.currentAcademicPeriod === null) {
      await supabase
        .from("userPreferences")
        .upsert({ userId, currentAcademicPeriod: local.currentAcademicPeriod });
    }
  } catch (e) {
    console.error("[merge] preferences failed:", e);
  }
}

async function mergeDraftPrefs(
  userId: string,
  map: LocalDraftPrefsMap,
): Promise<void> {
  for (const [periodStr, localPrefs] of Object.entries(map)) {
    const academicPeriod = Number(periodStr);
    try {
      const { data } = await supabase
        .from("userPlanDrafts")
        .select("*")
        .eq("userId", userId)
        .eq("academicPeriod", academicPeriod)
        .maybeSingle();

      if (!data) {
        await supabase.from("userPlanDrafts").insert({
          userId,
          academicPeriod,
          ...localPrefs,
        });
      } else {
        // Only fill nullable fields that are null server-side
        const patch: Partial<
          Record<
            "prefStartTime" | "prefEndTime" | "inputCampus" | "gapDay",
            string | null
          >
        > = {};
        for (const field of [
          "prefStartTime",
          "prefEndTime",
          "inputCampus",
          "gapDay",
        ] as const) {
          if (data[field] === null && localPrefs[field] !== null) {
            patch[field] = localPrefs[field];
          }
        }
        if (Object.keys(patch).length > 0) {
          await supabase
            .from("userPlanDrafts")
            .update(patch)
            .eq("userId", userId)
            .eq("academicPeriod", academicPeriod);
        }
      }
    } catch (e) {
      console.error(`[merge] draftPrefs period ${academicPeriod} failed:`, e);
    }
  }
}

async function mergeDraftCourses(
  userId: string,
  map: LocalDraftCoursesMap,
): Promise<void> {
  for (const [periodStr, courses] of Object.entries(map)) {
    if (!courses.length) continue;
    const academicPeriod = Number(periodStr);
    try {
      const { data: existing } = await supabase
        .from("userPlanDraftCourses")
        .select("courseId")
        .eq("userId", userId)
        .eq("academicPeriod", academicPeriod);

      const existingIds = new Set((existing ?? []).map((r) => r.courseId));
      const toInsert = courses.filter((c) => !existingIds.has(c.courseId));

      if (toInsert.length > 0) {
        await supabase.from("userPlanDraftCourses").insert(
          toInsert.map(({ courseId, excludedCrns }) => ({
            userId,
            academicPeriod,
            courseId,
            excludedCrns,
          })),
        );
      }
    } catch (e) {
      console.error(`[merge] draftCourses period ${academicPeriod} failed:`, e);
    }
  }
}

async function mergeSavedPlans(
  userId: string,
  plans: LocalSavedPlans,
): Promise<void> {
  if (!plans.length) return;
  try {
    await supabase.from("userSavedPlans").insert(
      plans.map(({ academicPeriod, title, crns, pinned }) => ({
        userId,
        academicPeriod,
        title,
        crns,
        pinned,
      })),
    );
  } catch (e) {
    console.error("[merge] savedPlans failed:", e);
  }
}
