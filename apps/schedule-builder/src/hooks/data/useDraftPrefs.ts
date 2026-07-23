"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import { useCurrentAcademicPeriod } from "./usePreferences";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import { LocalDraftPrefsMap } from "~/lib/localStorage/schemas";
import { readLocal, writeLocal } from "~/lib/localStorage/storage";
import { type DraftPrefs } from "~/lib/localStorage/types";

const DEFAULTS: DraftPrefs = {
  prefStartTime: null,
  prefEndTime: null,
  inputCampus: null,
  gapDay: null,
  minCreditHours: 12,
  maxCreditHours: 18,
  walking: false,
  showFilledClasses: false,
};

export function useDraftPrefs() {
  const { user, isLoading: sessionLoading } = useSession();
  const { academicPeriod } = useCurrentAcademicPeriod();
  const queryClient = useQueryClient();

  const { data: draftPrefs = DEFAULTS, isLoading } = useQuery<DraftPrefs>({
    queryKey: ["draft-prefs", academicPeriod],
    enabled: academicPeriod != null && !sessionLoading,
    queryFn: async () => {
      if (user) {
        const { data, error } = await supabase
          .from("userPlanDrafts")
          .select("*")
          .eq("academicPeriod", academicPeriod!)
          .maybeSingle();
        if (error) throw error;
        if (!data) return DEFAULTS;
        return {
          prefStartTime: data.prefStartTime ?? null,
          prefEndTime: data.prefEndTime ?? null,
          inputCampus: data.inputCampus ?? null,
          gapDay: data.gapDay ?? null,
          minCreditHours: data.minCreditHours,
          maxCreditHours: data.maxCreditHours,
          walking: data.walking,
          showFilledClasses: data.showFilledClasses,
        };
      }
      const map = readLocal(LOCAL_KEYS.draftPrefs, LocalDraftPrefsMap);
      return map[String(academicPeriod)] ?? DEFAULTS;
    },
  });

  const setPref = useMutation({
    mutationFn: async (args: {
      key: keyof DraftPrefs;
      value: DraftPrefs[keyof DraftPrefs];
    }) => {
      const { key, value } = args;
      const updated = { ...draftPrefs, [key]: value };
      if (user) {
        const { error } = await supabase.from("userPlanDrafts").upsert(
          {
            userId: user.id,
            academicPeriod: academicPeriod!,
            ...updated,
          },
          { onConflict: "userId,academicPeriod" },
        );
        if (error) throw error;
      } else {
        const map = readLocal(LOCAL_KEYS.draftPrefs, LocalDraftPrefsMap);
        writeLocal(LOCAL_KEYS.draftPrefs, LocalDraftPrefsMap, {
          ...map,
          [String(academicPeriod)]: updated,
        });
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["draft-prefs", academicPeriod],
      }),
  });

  return {
    draftPrefs,
    setPref: (key: keyof DraftPrefs, value: DraftPrefs[keyof DraftPrefs]) =>
      setPref.mutate({ key, value }),
    isLoading: sessionLoading || isLoading,
  };
}
