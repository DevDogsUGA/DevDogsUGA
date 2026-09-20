import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { SectionRow } from "~/types/course";

/** Shape of a row before it is flattened into {@link SectionRow}. */
type RawOfferingRow = {
  crn: number;
  courseId: number;
  seatsAvailable: number;
  cancelled: boolean;
  courses: {
    abbr: string;
    courseNumber: string;
    title: string;
    maxCreditHours: number;
  } | null;
  instructors: { firstName: string; lastName: string } | null;
};

/**
 * Every section of one course in the given term, read straight from the base
 * `offerings` table with its course + instructor embedded.
 */
export function useOfferingsByCourse(
  courseId: number,
  academicPeriod: number | undefined,
) {
  return useQuery<SectionRow[]>({
    queryKey: ["offerings-by-course", courseId, academicPeriod],
    enabled: !!academicPeriod,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select(
          "crn, courseId, seatsAvailable, cancelled, courses(abbr, courseNumber, title, maxCreditHours), instructors(firstName, lastName)",
        )
        .eq("courseId", courseId)
        .eq("academicPeriod", academicPeriod!)
        .order("crn");
      if (error) throw error;

      // PostgREST embeds are objects for these many-to-one FKs; the generated
      // types can widen them, so normalize through a known raw shape.
      const rows = (data ?? []) as unknown as RawOfferingRow[];
      return rows.map((row) => ({
        crn: row.crn,
        courseId: row.courseId,
        abbr: row.courses?.abbr ?? "",
        courseNumber: row.courses?.courseNumber ?? "",
        title: row.courses?.title ?? "",
        maxCreditHours: row.courses?.maxCreditHours ?? 0,
        firstName: row.instructors?.firstName ?? null,
        lastName: row.instructors?.lastName ?? null,
        seatsAvailable: row.seatsAvailable,
        cancelled: row.cancelled,
      }));
    },
  });
}
