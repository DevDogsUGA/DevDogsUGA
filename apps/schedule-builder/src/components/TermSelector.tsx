"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTerm } from "~/components/providers/TermProvider";
import { useSession } from "~/components/providers/SessionProvider";
import { supabase } from "~/supabase/client";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import { LocalDraftCoursesMap, LocalSavedPlans } from "~/lib/localStorage/schemas";
import { readLocal } from "~/lib/localStorage/storage";
import * as Select from "@radix-ui/react-select";
import { PiCaretUpDownBold } from "react-icons/pi";

function useTermCounts() {
  const { user, isLoading: sessionLoading } = useSession();

  const { data: courseCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["term-course-counts", user?.id],
    enabled: !sessionLoading,
    queryFn: async () => {
      const counts: Record<number, number> = {};
      if (user) {
        const { data, error } = await supabase
          .from("userPlanDraftCourses")
          .select("academicPeriod");
        if (error) throw error;
        for (const row of data ?? []) {
          counts[row.academicPeriod] = (counts[row.academicPeriod] ?? 0) + 1;
        }
      } else {
        const map = readLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap);
        for (const [period, courses] of Object.entries(map)) {
          if (courses.length > 0) counts[Number(period)] = courses.length;
        }
      }
      return counts;
    },
  });

  const { data: planCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["term-plan-counts", user?.id],
    enabled: !sessionLoading,
    queryFn: async () => {
      const counts: Record<number, number> = {};
      if (user) {
        const { data, error } = await supabase
          .from("userSavedPlans")
          .select("academicPeriod");
        if (error) throw error;
        for (const row of data ?? []) {
          counts[row.academicPeriod] = (counts[row.academicPeriod] ?? 0) + 1;
        }
      } else {
        const all = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);
        for (const plan of all) {
          counts[plan.academicPeriod] = (counts[plan.academicPeriod] ?? 0) + 1;
        }
      }
      return counts;
    },
  });

  return { courseCounts, planCounts };
}

export function TermSelector() {
  const { academicPeriod, setAcademicPeriod, availableTerms } = useTerm();
  const { courseCounts, planCounts } = useTermCounts();

  const { data: partsOfTerm = [] } = useQuery({
    queryKey: ["parts-of-term"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partsOfTerm")
        .select("academicPeriod, dropAddEnds");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });

  const { openTerms, closedTerms } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const openPeriods = new Set<number>();
    for (const pot of partsOfTerm) {
      if (pot.dropAddEnds >= today) openPeriods.add(pot.academicPeriod);
    }

    const sorted = [...availableTerms].sort(
      (a, b) => b.academicPeriod - a.academicPeriod,
    );

    return {
      openTerms: sorted.filter((t) => openPeriods.has(t.academicPeriod)),
      closedTerms: sorted.filter((t) => !openPeriods.has(t.academicPeriod)),
    };
  }, [availableTerms, partsOfTerm]);

  if (availableTerms.length === 0) return null;

  function renderItem(term: { academicPeriod: number; description: string }) {
    const courses = courseCounts[term.academicPeriod] ?? 0;
    const plans = planCounts[term.academicPeriod] ?? 0;

    return (
      <Select.Item
        key={term.academicPeriod}
        value={String(term.academicPeriod)}
        className="flex w-full items-center justify-between gap-3 py-1.5 pr-3 pl-3 transition-colors hover:bg-zinc-200"
      >
        <span className="truncate">{term.description}</span>
        {(courses > 0 || plans > 0) && (
          <span className="shrink-0 text-xs text-zinc-400">
            {courses > 0 && `${courses} course${courses !== 1 ? "s" : ""}`}
            {courses > 0 && plans > 0 && ", "}
            {plans > 0 && `${plans} plan${plans !== 1 ? "s" : ""}`}
          </span>
        )}
      </Select.Item>
    );
  }

  return (
    <Select.Root
      value={String(academicPeriod)}
      onValueChange={(v) => setAcademicPeriod(Number(v))}
    >
      <Select.Trigger className="group flex max-w-2xs flex-1 items-center gap-3 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-[box-shadow,border-color,color] hover:border-zinc-400 hover:inset-shadow-sm">
        <span className="w-full flex-1 truncate text-left">
          <Select.Value>
            {
              availableTerms.find(
                (term) => term.academicPeriod === academicPeriod,
              )?.description
            }
          </Select.Value>
        </span>
        <PiCaretUpDownBold className="text-zinc-500 transition-colors group-hover:text-zinc-800" />
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="z-50 flex max-w-xs min-w-52 flex-col rounded-xl border border-zinc-400 bg-white py-1.5 text-sm shadow-xl"
          position="popper"
          sideOffset={3}
        >
          {openTerms.length > 0 && (
            <Select.Group>
              <Select.Label className="px-3 pt-1 pb-0.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Open for Registration
              </Select.Label>
              {openTerms.map(renderItem)}
            </Select.Group>
          )}

          {openTerms.length > 0 && closedTerms.length > 0 && (
            <Select.Separator className="mx-2 my-1.5 h-px bg-zinc-200" />
          )}

          {closedTerms.length > 0 && (
            <Select.Group>
              <Select.Label className="px-3 pt-1 pb-0.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Registration Closed
              </Select.Label>
              {closedTerms.map(renderItem)}
            </Select.Group>
          )}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
