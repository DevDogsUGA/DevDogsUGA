"use client";

import { createContext, type PropsWithChildren, useContext } from "react";
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
        .select("academicPeriod, description")
        .order("academicPeriod", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        academicPeriod: r.academicPeriod!,
        description: r.description!,
      }));
    },
    initialData: initialTerms,
    staleTime: Infinity,
  });

  const { academicPeriod: savedPeriod, setCurrentAcademicPeriod } =
    useCurrentAcademicPeriod();

  // A returning user may have saved a term that has since aged out of the
  // registrar feed. Never let that stale preference drive every catalog query
  // to an invisible period; fall back to the newest available term.
  const savedPeriodIsAvailable = availableTerms.some(
    ({ academicPeriod }) => academicPeriod === savedPeriod,
  );
  const academicPeriod =
    (savedPeriodIsAvailable ? savedPeriod : null) ??
    availableTerms[0]?.academicPeriod ??
    null;

  function setAcademicPeriod(period: number) {
    setCurrentAcademicPeriod(period);
    void queryClient.invalidateQueries({ queryKey: ["draft-courses"] });
    void queryClient.invalidateQueries({ queryKey: ["draft-prefs"] });
    void queryClient.invalidateQueries({ queryKey: ["plans"] });
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
