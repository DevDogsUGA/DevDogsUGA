import { useQuery } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";

export interface Instructor {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * Every instructor in the catalog, ordered by name. The list can run to
 * thousands of rows; the Combobox virtualizes and filters it client-side. Only
 * fetched when the Instructor tab mounts this hook.
 */
export function useInstructors() {
  return useQuery<Instructor[]>({
    queryKey: ["instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructors")
        .select("id, firstName, lastName")
        .order("lastName")
        .order("firstName");
      if (error) throw error;
      return data ?? [];
    },
  });
}
