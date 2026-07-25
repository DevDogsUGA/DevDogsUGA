import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";

export function useInstructors() {
  return useQuery({
    queryKey: ["instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructors")
        .select("firstName, lastName")
        .order("lastName");
      if (error) throw error;
      return (data ?? []).map((r) => `${r.firstName} ${r.lastName}`);
    },
  });
}
