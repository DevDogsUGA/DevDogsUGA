"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import { LocalPreferences } from "~/lib/localStorage/schemas";
import { readLocal, writeLocal } from "~/lib/localStorage/storage";

export function useCurrentAcademicPeriod() {
  const { user, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: async () => {
      if (user) {
        const { data, error } = await supabase
          .from("userPreferences")
          .select("currentAcademicPeriod")
          .eq("userId", user.id)
          .maybeSingle();
        if (error) throw error;
        return { currentAcademicPeriod: data?.currentAcademicPeriod ?? null };
      }
      return readLocal(LOCAL_KEYS.preferences, LocalPreferences);
    },
    enabled: !sessionLoading,
    staleTime: 30_000,
  });

  const setMutation = useMutation({
    mutationFn: async (period: number) => {
      if (user) {
        const { error } = await supabase
          .from("userPreferences")
          .upsert({ userId: user.id, currentAcademicPeriod: period });
        if (error) throw error;
      } else {
        writeLocal(LOCAL_KEYS.preferences, LocalPreferences, {
          currentAcademicPeriod: period,
        });
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["preferences"] }),
  });

  return {
    academicPeriod: prefs?.currentAcademicPeriod ?? null,
    setCurrentAcademicPeriod: setMutation.mutate,
    isLoading: sessionLoading || isLoading,
  };
}
