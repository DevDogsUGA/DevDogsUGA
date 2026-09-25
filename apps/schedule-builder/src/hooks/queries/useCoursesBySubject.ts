import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { CourseOption } from "~/types/course";

type RawCourseRow = {
  id: number;
  abbr: string;
  courseNumber: string;
  title: string;
  maxCreditHours: number;
};

/**
 * Fetch courses in a subject that have at least one non-cancelled offering in
 * the given term. The `offerings!inner` embed filters courses down to those
 * actually offered this term, returning one row per course.
 */
export async function fetchCoursesBySubject(
  subjectId: number,
  academicPeriod: number,
): Promise<CourseOption[]> {
  const { data, error } = await supabase
    .from("courses")
    .select(
      "id, abbr, courseNumber, title, maxCreditHours, offerings!inner(academicPeriod)",
    )
    .eq("subjectId", subjectId)
    .eq("offerings.academicPeriod", academicPeriod)
    .eq("offerings.cancelled", false)
    .order("courseNumber");
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawCourseRow[];
  return rows.map((row) => ({
    courseId: row.id,
    abbr: row.abbr,
    courseNumber: row.courseNumber,
    title: row.title,
    maxCreditHours: row.maxCreditHours,
  }));
}

/** Courses in a subject with a non-cancelled offering in the given term. */
export function useCoursesBySubject(
  subjectId: number | undefined,
  academicPeriod: number | null | undefined,
) {
  return useQuery<CourseOption[]>({
    queryKey: ["courses-by-subject", subjectId, academicPeriod],
    enabled: subjectId != null && academicPeriod != null,
    queryFn: async () => {
      return fetchCoursesBySubject(subjectId!, academicPeriod!);
    },
  });
}
