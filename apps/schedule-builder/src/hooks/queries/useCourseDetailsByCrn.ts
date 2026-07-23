import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { Course } from "~/types/course";

type SupabaseRow = {
  crn: number;
  courses: {
    id: number;
    courseNumber: string;
    title: string;
    abbrTitle: string;
    subjects: { abbr: string } | null;
  } | null;
};

export function useCourseDetailsByCrn(crn: string | undefined) {
  return useQuery<Course | null>({
    queryKey: ["course", "byCrn", crn],
    enabled: crn !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select(
          `crn,
           courses!inner(id, courseNumber, title, abbrTitle, subjects(abbr))`,
        )
        .eq("crn", Number(crn))
        .single();
      if (error) throw error;
      if (!data) return null;

      const c = (data as unknown as SupabaseRow).courses;
      if (!c) return null;

      return {
        courseId: c.id,
        subject: c.subjects?.abbr,
        courseNumber: c.courseNumber,
        title: c.title,
        athenaTitle: c.abbrTitle,
      };
    },
  });
}
