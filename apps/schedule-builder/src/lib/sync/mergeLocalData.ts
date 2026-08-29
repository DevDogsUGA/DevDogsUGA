import { supabase } from "~/supabase/client";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import {
  LocalPreferences,
  LocalDraftPrefsMap,
  LocalDraftCoursesMap,
  LocalSavedPlans,
} from "~/lib/localStorage/schemas";
import { readLocal, clearLocal } from "~/lib/localStorage/storage";

/**
 * supabase-js resolves with `{ data, error }` rather than rejecting, so a
 * failed write looks exactly like a successful one to a bare `await`. Every
 * call here goes through this so a failure actually reaches the caller.
 */
function assertOk(
  { error }: { error: { message: string } | null },
  what: string,
): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * Copies a signed-out visitor's local data into their account on sign-in.
 *
 * Each key is cleared only once its own merge has actually succeeded — an RLS
 * denial or a dropped connection must never leave the data deleted locally and
 * absent server-side.
 */
export async function runLocalDataMerge(userId: string): Promise<void> {
  const localPrefs = readLocal(LOCAL_KEYS.preferences, LocalPreferences);
  const localDraftPrefsMap = readLocal(
    LOCAL_KEYS.draftPrefs,
    LocalDraftPrefsMap,
  );
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

  const merges: { key: string; run: () => Promise<void> }[] = [
    {
      key: LOCAL_KEYS.preferences,
      run: () => mergePreferences(userId, localPrefs),
    },
    {
      key: LOCAL_KEYS.draftPrefs,
      run: () => mergeDraftPrefs(userId, localDraftPrefsMap),
    },
    {
      key: LOCAL_KEYS.draftCourses,
      run: () => mergeDraftCourses(userId, localDraftCoursesMap),
    },
    {
      key: LOCAL_KEYS.savedPlans,
      run: () => mergeSavedPlans(userId, localSavedPlans),
    },
  ];

  const results = await Promise.allSettled(merges.map(({ run }) => run()));

  results.forEach((result, i) => {
    const { key } = merges[i]!;
    if (result.status === "fulfilled") {
      clearLocal(key);
    } else {
      console.error(
        `[merge] ${key} failed, keeping local copy:`,
        result.reason,
      );
    }
  });
}

async function mergePreferences(
  userId: string,
  local: LocalPreferences,
): Promise<void> {
  if (local.currentAcademicPeriod === null) return;

  const existing = await supabase
    .from("userPreferences")
    .select("currentAcademicPeriod")
    .eq("userId", userId)
    .maybeSingle();
  assertOk(existing, "read preferences");

  if (existing.data?.currentAcademicPeriod == null) {
    assertOk(
      await supabase
        .from("userPreferences")
        .upsert({ userId, currentAcademicPeriod: local.currentAcademicPeriod }),
      "write preferences",
    );
  }
}

async function mergeDraftPrefs(
  userId: string,
  map: LocalDraftPrefsMap,
): Promise<void> {
  for (const [periodStr, localPrefs] of Object.entries(map)) {
    const academicPeriod = Number(periodStr);

    const existing = await supabase
      .from("userPlanDrafts")
      .select("*")
      .eq("userId", userId)
      .eq("academicPeriod", academicPeriod)
      .maybeSingle();
    assertOk(existing, `read draftPrefs ${academicPeriod}`);

    if (!existing.data) {
      assertOk(
        await supabase.from("userPlanDrafts").insert({
          userId,
          academicPeriod,
          ...localPrefs,
        }),
        `insert draftPrefs ${academicPeriod}`,
      );
      continue;
    }

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
      if (existing.data[field] === null && localPrefs[field] !== null) {
        patch[field] = localPrefs[field];
      }
    }
    if (Object.keys(patch).length > 0) {
      assertOk(
        await supabase
          .from("userPlanDrafts")
          .update(patch)
          .eq("userId", userId)
          .eq("academicPeriod", academicPeriod),
        `update draftPrefs ${academicPeriod}`,
      );
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

    // The table is unique on (userId, academicPeriod, courseId), so an upsert
    // that ignores duplicates is safe to run twice — two tabs both handling
    // SIGNED_IN converge instead of racing.
    assertOk(
      await supabase.from("userPlanDraftCourses").upsert(
        courses.map(({ courseId, excludedCrns }) => ({
          userId,
          academicPeriod,
          courseId,
          excludedCrns,
        })),
        {
          onConflict: "userId,academicPeriod,courseId",
          ignoreDuplicates: true,
        },
      ),
      `merge draftCourses ${academicPeriod}`,
    );
  }
}

async function mergeSavedPlans(
  userId: string,
  plans: LocalSavedPlans,
): Promise<void> {
  if (!plans.length) return;

  // Carrying the local UUID over as the primary key makes the merge
  // idempotent: a retry, or a second tab, upserts the same rows.
  assertOk(
    await supabase.from("userSavedPlans").upsert(
      plans.map(({ id, academicPeriod, title, crns, pinned }) => ({
        id,
        userId,
        academicPeriod,
        title,
        crns,
        pinned,
      })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    "merge savedPlans",
  );
}
