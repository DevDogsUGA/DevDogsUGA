import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("abbr")
        .order("abbr");
      if (error) throw error;
      return data.map((r) => r.abbr as string);
    },
  });
}
