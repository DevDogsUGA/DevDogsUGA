import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";

export function useInstructorRating(firstName: string, lastName: string) {
  return useQuery({
    queryKey: ["instructorRating", firstName, lastName],
    enabled: !!(firstName && lastName),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructors")
        .select("averageRating, totalReviews")
        .eq("firstName", firstName)
        .eq("lastName", lastName)
        .maybeSingle();
      if (error) throw error;
      return {
        averageRating: data?.averageRating ?? 0,
        totalReviews: data?.totalReviews ?? 0,
      };
    },
  });
}
