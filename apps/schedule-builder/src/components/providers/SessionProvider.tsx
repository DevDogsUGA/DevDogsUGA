"use client";

import { type PropsWithChildren, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Session } from "@supabase/supabase-js";
import { supabase } from "~/supabase/client";
import { runLocalDataMerge } from "~/lib/sync/mergeLocalData";

export function useSession() {
  const { data: session = null, isLoading } = useQuery<Session | null>({
    queryKey: ["session"],
    queryFn: () => supabase.auth.getSession().then((r) => r.data.session),
    staleTime: Infinity,
  });
  return { session, user: session?.user ?? null, isLoading };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => queryClient.setQueryData(["session"], data.session));

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        queryClient.setQueryData(["session"], session);

        if (event === "SIGNED_IN" && session?.user) {
          await runLocalDataMerge(session.user.id);
        }

        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          void queryClient.invalidateQueries({ queryKey: ["preferences"] });
          void queryClient.invalidateQueries({ queryKey: ["draft-prefs"] });
          void queryClient.invalidateQueries({ queryKey: ["draft-courses"] });
          void queryClient.invalidateQueries({ queryKey: ["plans"] });
        }
      },
    );

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return <>{children}</>;
}
