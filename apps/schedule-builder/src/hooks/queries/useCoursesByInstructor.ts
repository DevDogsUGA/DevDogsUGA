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

export function useCoursesByInstructor(fullName: string | undefined) {
  return useQuery<Course[]>({
    queryKey: ["courses", "byInstructor", fullName],
    enabled: fullName !== undefined,
    queryFn: async () => {
      const [firstName, ...rest] = (fullName ?? "").split(" ");
      const lastName = rest.join(" ");

      const { data, error } = await supabase
        .from("offerings")
        .select(
          `crn,
           instructors!inner(firstName, lastName),
           courses!inner(id, courseNumber, title, abbrTitle, subjects(abbr))`,
        )
        .eq("instructors.firstName", firstName ?? "")
        .eq("instructors.lastName", lastName);
      if (error) throw error;

      const seen = new Set<number>();
      const courses: Course[] = [];

      for (const row of (data ?? []) as unknown as SupabaseRow[]) {
        const c = row.courses;
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        courses.push({
          courseId: c.id,
          subject: c.subjects?.abbr,
          courseNumber: c.courseNumber,
          title: c.title,
          athenaTitle: c.abbrTitle,
        });
      }

      return courses;
    },
  });
}
