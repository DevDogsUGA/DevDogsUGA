import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";

export interface Subject {
  id: number;
  abbr: string;
  description: string;
}

/** Every subject in the catalog, ordered by abbreviation. */
export function useSubjects() {
  return useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, abbr, description")
        .order("abbr");
      if (error) throw error;
      return data ?? [];
    },
  });
}
