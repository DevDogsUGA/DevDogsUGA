import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";

export function useCrns() {
  return useQuery({
    queryKey: ["crns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("crn")
        .order("crn");
      if (error) throw error;
      return (data ?? []).map((r) => r.crn as number);
    },
  });
}
