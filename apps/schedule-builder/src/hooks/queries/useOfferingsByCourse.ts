import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import type { OfferingSearchRow } from "~/types/course";

export function useOfferingsByCourse(
  courseId: number,
  academicPeriod: number | undefined,
) {
  return useQuery<OfferingSearchRow[]>({
    queryKey: ["offerings-by-course", courseId, academicPeriod],
    enabled: !!academicPeriod,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offeringSearch")
        .select(
          "crn, courseId, abbr, courseNumber, title, maxCreditHours, firstName, lastName, seatsAvailable, active",
        )
        .eq("courseId", courseId)
        .eq("academicPeriod", academicPeriod!)
        .order("crn");
      if (error) throw error;
      return (data ?? []) as OfferingSearchRow[];
    },
  });
}
