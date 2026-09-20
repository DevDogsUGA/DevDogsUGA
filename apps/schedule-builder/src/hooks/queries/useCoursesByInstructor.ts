import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { CourseOption } from "~/types/course";

type RawInstructorOfferingRow = {
  courseId: number;
  courses: {
    id: number;
    abbr: string;
    courseNumber: string;
    title: string;
    maxCreditHours: number;
  } | null;
};

/**
 * Distinct courses an instructor teaches in the given term. Read from the
 * `offerings` table (which carries the instructor→course link) and deduped by
 * course, since an instructor may teach several sections of the same course.
 */
export function useCoursesByInstructor(
  instructorId: number | undefined,
  academicPeriod: number | null | undefined,
) {
  return useQuery<CourseOption[]>({
    queryKey: ["courses-by-instructor", instructorId, academicPeriod],
    enabled: instructorId != null && academicPeriod != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select(
          "courseId, courses(id, abbr, courseNumber, title, maxCreditHours)",
        )
        .eq("instructorId", instructorId!)
        .eq("academicPeriod", academicPeriod!);
      if (error) throw error;

      const rows = (data ?? []) as unknown as RawInstructorOfferingRow[];
      const byCourse = new Map<number, CourseOption>();
      for (const row of rows) {
        const course = row.courses;
        if (!course || byCourse.has(course.id)) continue;
        byCourse.set(course.id, {
          courseId: course.id,
          abbr: course.abbr,
          courseNumber: course.courseNumber,
          title: course.title,
          maxCreditHours: course.maxCreditHours,
        });
      }
      return [...byCourse.values()].sort((a, b) =>
        a.courseNumber.localeCompare(b.courseNumber),
      );
    },
  });
}
