"use client";

import WeekSchedule from "~/components/schedules/WeekSchedule";
import Link from "next/link";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  HeartIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import { useSavedPlan } from "~/hooks/data/useSavedPlans";
import { getPlanOfferings } from "~/server/actions/get-plan-offerings";

interface Props {
  id: string;
}

export default function ScheduleDisplay({ id }: Props) {
  const {
    plan: currentPlan,
    savedPlans: allPlans,
    updatePlan,
  } = useSavedPlan(id);
  const currentPlanIndex = allPlans.findIndex((p) => p.id === id);

  const { data: weekData } = useQuery({
    queryKey: ["plan-offerings", id],
    enabled: !!currentPlan?.crns?.length,
    queryFn: () => getPlanOfferings(currentPlan!.crns),
  });

  const handleInputKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    [],
  );

  const handleChangeTitle = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const title = e.currentTarget.value.trim();
      if (title.length < 1) {
        if (currentPlan) e.currentTarget.value = currentPlan.title;
        return;
      }
      e.currentTarget.value = title;
      updatePlan.mutate({ id, title });
    },
    [currentPlan, id, updatePlan],
  );

  if (currentPlanIndex === -1 || !currentPlan) return null;

  const prevPlan =
    allPlans[(currentPlanIndex + allPlans.length - 1) % allPlans.length];
  const nextPlan = allPlans[(currentPlanIndex + 1) % allPlans.length];

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="flex min-h-[80dvh] flex-1 flex-col rounded-xl border border-edge bg-surface pt-2">
        <div className="flex flex-row items-center justify-between px-12 py-2">
          <button
            type="button"
            className="cursor-default"
            onClick={() =>
              updatePlan.mutate({ id, pinned: !currentPlan.pinned })
            }
          >
            {currentPlan.pinned ? (
              <HeartIcon
                weight="fill"
                className="size-8 text-accent transition"
              />
            ) : (
              <HeartIcon
                weight="bold"
                className="m-0.5 size-7 transition-[color,width,height,margin] hover:m-0 hover:size-8 hover:text-accent"
              />
            )}
          </button>

          <div className="flex flex-row items-center justify-center gap-0.5 rounded-lg">
            {allPlans.length > 1 && prevPlan && (
              <Link
                className="rounded-l-lg border-2 border-transparent px-2 py-1 text-2xl transition-colors hover:border-edge-strong hover:bg-surface-muted"
                href={`/plans/${prevPlan.id}`}
                title={prevPlan.title}
              >
                <ArrowLeftIcon weight="bold" />
              </Link>
            )}

            <input
              className="rounded-sm border-2 border-transparent bg-transparent pt-0.5 pb-px text-center text-xl font-semibold transition-colors hover:border-edge-strong focus:border-edge-strong focus:outline-none"
              defaultValue={currentPlan.title}
              key={currentPlan.id}
              maxLength={32}
              onBlur={handleChangeTitle}
              onKeyUp={handleInputKeyUp}
            />

            {allPlans.length > 1 && nextPlan && (
              <Link
                className="rounded-r-lg border-2 border-transparent px-2 py-1 text-2xl transition-colors hover:border-edge-strong hover:bg-surface-muted"
                href={`/plans/${nextPlan.id}`}
                title={nextPlan.title}
              >
                <ArrowRightIcon weight="bold" />
              </Link>
            )}
          </div>

          <Link href="/plans" className="transition-colors hover:text-accent">
            <XIcon weight="bold" className="size-7" />
          </Link>
        </div>

        <div className="flex grow flex-row overflow-y-auto">
          {weekData ? (
            <WeekSchedule weekData={weekData} />
          ) : (
            <div className="m-auto flex w-full animate-pulse flex-col gap-2 p-4">
              {["M", "T", "W", "Th", "F"].map((day) => (
                <div key={day} className="flex gap-2">
                  <div className="w-8 shrink-0 rounded bg-surface-muted py-1 text-center text-xs text-muted">
                    {day}
                  </div>
                  <div className="h-12 flex-1 rounded bg-surface-muted" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
