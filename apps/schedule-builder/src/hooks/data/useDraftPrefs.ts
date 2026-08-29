"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import { useTerm } from "~/components/providers/TermProvider";
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

/**
 * `prefStartTime`/`prefEndTime` are Postgres `time` columns, which PostgREST
 * serialises as "HH:MM:SS". The UI keys its options by "HH:MM", so trim the
 * seconds on the way in or the saved value matches nothing in the dropdown.
 */
function toTimeOption(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  return h && m ? `${h}:${m}` : t;
}

export function useDraftPrefs() {
  const { user, isLoading: sessionLoading } = useSession();
  // Read the effective term from TermProvider, not the raw preference:
  // a first-time visitor has no saved preference, and the provider's
  // fallback to the latest term is what the UI actually displays.
  const { academicPeriod } = useTerm();
  const queryClient = useQueryClient();

  const { data: draftPrefs = DEFAULTS, isLoading } = useQuery<DraftPrefs>({
    queryKey: ["draft-prefs", academicPeriod],
    enabled: academicPeriod != null && !sessionLoading,
    queryFn: async () => {
      if (user) {
        const { data, error } = await supabase
          .from("userPlanDrafts")
          .select("*")
          .eq("userId", user.id)
          .eq("academicPeriod", academicPeriod!)
          .maybeSingle();
        if (error) throw error;
        if (!data) return DEFAULTS;
        return {
          prefStartTime: toTimeOption(data.prefStartTime),
          prefEndTime: toTimeOption(data.prefEndTime),
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
