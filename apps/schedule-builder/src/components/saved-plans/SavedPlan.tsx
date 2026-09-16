"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  CalendarDotsIcon,
  HeartIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";

interface PlanDisplayProps {
  plan: { id: string; title: string; pinned: boolean };
  onPin: () => void;
  onDelete: () => void;
}

// Saved Plan Component.
// Contains each "banner" and action buttons for each of the user's saved plans.
export default function SavedPlan({ plan, onPin, onDelete }: PlanDisplayProps) {
  const router = useRouter();

  const goToPlan = useCallback(() => {
    router.push(`/plans/${plan.id}`);
  }, [router, plan]);

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPin();
    },
    [onPin],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete],
  );

  return (
    <div
      className="border-edge border-l-primary bg-surface hover:border-edge-strong hover:border-l-primary-strong relative z-10 flex w-full cursor-pointer flex-row items-center gap-4 rounded-xl border border-l-6 px-6 py-4 shadow-xs transition-[border-color,box-shadow,background-color] hover:shadow-sm"
      onClick={goToPlan}
      role="link"
    >
      <CalendarDotsIcon
        weight="duotone"
        className="text-accent size-8 shrink-0"
      />

      {/* Plan title */}
      <h2 className="flex-1 truncate text-2xl font-bold">{plan.title}</h2>

      {/* Pin button (gives a saved plan priority over others*/}
      <button
        type="button"
        aria-label={plan.pinned ? `Unpin ${plan.title}` : `Pin ${plan.title}`}
        className="cursor-default"
        onClick={handlePin}
      >
        {plan.pinned ? (
          <HeartIcon weight="fill" className="text-accent size-8 transition" />
        ) : (
          <HeartIcon
            weight="bold"
            className="hover:text-accent m-0.5 size-7 transition-[color,width,height,margin] hover:m-0 hover:size-8"
          />
        )}
      </button>

      <button
        type="button"
        aria-label={`Delete ${plan.title}`}
        className="hover:bg-primary/15 cursor-default rounded-md p-0.5 transition-colors"
        onClick={handleDelete}
      >
        <TrashIcon weight="bold" className="text-accent size-7" />
      </button>
    </div>
  );
}
