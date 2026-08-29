"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import { useTerm } from "~/components/providers/TermProvider";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import { LocalDraftCoursesMap } from "~/lib/localStorage/schemas";
import { readLocal, writeLocal } from "~/lib/localStorage/storage";
import { type DraftCourse } from "~/lib/localStorage/types";

export function useDraftCourses() {
  const { user, isLoading: sessionLoading } = useSession();
  // Read the effective term from TermProvider, not the raw preference:
  // a first-time visitor has no saved preference, and the provider's
  // fallback to the latest term is what the UI actually displays.
  const { academicPeriod } = useTerm();
  const queryClient = useQueryClient();

  const { data: draftCourses = [], isLoading } = useQuery<DraftCourse[]>({
    queryKey: ["draft-courses", academicPeriod],
    enabled: academicPeriod != null && !sessionLoading,
    queryFn: async () => {
      if (user) {
        const { data, error } = await supabase
          .from("userPlanDraftCourses")
          .select(
            "id, courseId, excludedCrns, courses(abbr, courseNumber, title)",
          )
          .eq("academicPeriod", academicPeriod!);
        if (error) throw error;
        return data ?? [];
      }
      const map = readLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap);
      const flat = map[String(academicPeriod)] ?? [];
      // Normalize flat local shape → DraftCourse shape (embedded course object)
      return flat.map(
        ({ id, courseId, excludedCrns, abbr, courseNumber, title }) => ({
          id,
          courseId,
          excludedCrns,
          courses: { abbr, courseNumber, title },
        }),
      );
    },
  });

  const upsertCourse = useMutation({
    mutationFn: async (input: {
      courseId: number;
      abbr: string;
      courseNumber: string;
      title: string;
      excludedCrns: number[];
    }) => {
      if (user) {
        const { error } = await supabase.from("userPlanDraftCourses").upsert(
          {
            userId: user.id,
            academicPeriod: academicPeriod!,
            courseId: input.courseId,
            excludedCrns: input.excludedCrns,
          },
          { onConflict: "userId,academicPeriod,courseId" },
        );
        if (error) throw error;
      } else {
        const map = readLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap);
        const existing = map[String(academicPeriod)] ?? [];
        const idx = existing.findIndex((c) => c.courseId === input.courseId);
        const entry = {
          id: idx >= 0 ? existing[idx]!.id : crypto.randomUUID(),
          courseId: input.courseId,
          excludedCrns: input.excludedCrns,
          abbr: input.abbr,
          courseNumber: input.courseNumber,
          title: input.title,
        };
        const updated =
          idx >= 0
            ? existing.map((c, i) => (i === idx ? entry : c))
            : [...existing, entry];
        writeLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap, {
          ...map,
          [String(academicPeriod)]: updated,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["draft-courses", academicPeriod],
      });
      void queryClient.invalidateQueries({ queryKey: ["term-course-counts"] });
    },
  });

  const removeCourse = useMutation({
    mutationFn: async (id: string) => {
      if (user) {
        const { error } = await supabase
          .from("userPlanDraftCourses")
          .delete()
          .eq("id", id)
          .eq("userId", user.id);
        if (error) throw error;
      } else {
        const map = readLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap);
        const existing = map[String(academicPeriod)] ?? [];
        writeLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap, {
          ...map,
          [String(academicPeriod)]: existing.filter((c) => c.id !== id),
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["draft-courses", academicPeriod],
      });
      void queryClient.invalidateQueries({ queryKey: ["term-course-counts"] });
    },
  });

  return {
    draftCourses,
    upsertCourse,
    removeCourse,
    isLoading: sessionLoading || isLoading,
  };
}
