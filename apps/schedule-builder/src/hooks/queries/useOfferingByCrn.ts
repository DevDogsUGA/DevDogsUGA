import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { CourseOption } from "~/types/course";

type RawCrnRow = {
  crn: number;
  courseId: number;
  cancelled: boolean;
  courses: {
    id: number;
    abbr: string;
    courseNumber: string;
    title: string;
    maxCreditHours: number;
  } | null;
};

export interface CrnLookupResult {
  crn: number;
  course: CourseOption;
  /** Whether the offering for this CRN has been cancelled for the term. */
  cancelled: boolean;
}

/**
 * Resolves a CRN to its course for the given term. Returns `null` when no
 * offering matches (unknown CRN, or a CRN from another term). The result's
 * `cancelled` flag is set for offerings that exist but have been cancelled,
 * so callers can show a distinct message instead of an addable course.
 */
export async function fetchOfferingByCrn(
  crn: number,
  academicPeriod: number,
): Promise<CrnLookupResult | null> {
  const { data, error } = await supabase
    .from("offerings")
    .select(
      "crn, courseId, cancelled, courses(id, abbr, courseNumber, title, maxCreditHours)",
    )
    .eq("academicPeriod", academicPeriod)
    .eq("crn", crn)
    .maybeSingle();
  if (error) throw error;

  const row = data as unknown as RawCrnRow | null;
  if (!row?.courses) return null;
  return {
    crn: row.crn,
    cancelled: row.cancelled,
    course: {
      courseId: row.courses.id,
      abbr: row.courses.abbr,
      courseNumber: row.courses.courseNumber,
      title: row.courses.title,
      maxCreditHours: row.courses.maxCreditHours,
    },
  };
}

/** Resolves a CRN to its course (and cancellation status) for the given term. */
export function useOfferingByCrn(
  crn: number | undefined,
  academicPeriod: number | null | undefined,
) {
  return useQuery<CrnLookupResult | null>({
    queryKey: ["offering-by-crn", crn, academicPeriod],
    enabled: crn != null && academicPeriod != null,
    queryFn: async () => {
      return fetchOfferingByCrn(crn!, academicPeriod!);
    },
  });
}
