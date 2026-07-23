"use client";

import {
  createContext,
  type PropsWithChildren,
  useContext,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import { useCurrentAcademicPeriod } from "~/hooks/data/usePreferences";

type AvailableTerm = { academicPeriod: number; description: string };

type TermContextValue = {
  academicPeriod: number | null;
  setAcademicPeriod: (period: number) => void;
  availableTerms: AvailableTerm[];
};

const TermContext = createContext<TermContextValue | null>(null);

export function TermProvider({
  children,
  initialTerms,
}: PropsWithChildren<{ initialTerms: AvailableTerm[] }>) {
  const queryClient = useQueryClient();

  const { data: availableTerms = [] } = useQuery({
    queryKey: ["available-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availableTerms")
        .select("academicPeriod, description");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        academicPeriod: r.academicPeriod as number,
        description: r.description as string,
      }));
    },
    initialData: initialTerms,
    staleTime: Infinity,
  });

  const {
    academicPeriod: savedPeriod,
    setCurrentAcademicPeriod,
  } = useCurrentAcademicPeriod();

  // Fall back to the latest available term if no preference is saved yet
  const academicPeriod = savedPeriod ?? availableTerms[0]?.academicPeriod ?? null;

  function setAcademicPeriod(period: number) {
    setCurrentAcademicPeriod(period);
    queryClient.invalidateQueries({ queryKey: ["draft-courses"] });
    queryClient.invalidateQueries({ queryKey: ["draft-prefs"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    queryClient.invalidateQueries({ queryKey: ["offering-search"] });
  }

  return (
    <TermContext.Provider
      value={{ academicPeriod, setAcademicPeriod, availableTerms }}
    >
      {children}
    </TermContext.Provider>
  );
}

export function useTerm() {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error("useTerm must be used inside TermProvider");
  return ctx;
}
