"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { HeartIcon, TrashIcon } from "@phosphor-icons/react/ssr";

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
      className="relative z-10 flex w-[70vw] cursor-pointer flex-row items-center gap-4 rounded-xl border-b-8 border-red-700 bg-white px-7 py-4 ring-2 ring-black hover:mt-1 hover:border-b-4 hover:border-red-700 hover:bg-neutral-100 [&:active:not(:has(input:hover,button:hover))]:border-t-4 [&:active:not(:has(input:hover,button:hover))]:border-b-0"
      onClick={goToPlan}
      role="link"
    >
      {/* Paw icon */}
      <Image
        src="/images/blackpaw.svg"
        width={64}
        height={64}
        className="size-8"
        alt="black paw"
      />

      {/* Plan title */}
      <h2 className="flex-1 text-2xl font-bold text-black">{plan.title}</h2>

      {/* Pin button (gives a saved plan priority over others*/}
      <button
        type="button"
        aria-label={plan.pinned ? `Unpin ${plan.title}` : `Pin ${plan.title}`}
        className="cursor-default"
        onClick={handlePin}
      >
        {plan.pinned ? (
          <HeartIcon weight="fill" className="size-8 text-red-600 transition" />
        ) : (
          <HeartIcon
            weight="bold"
            className="m-0.5 size-7 transition-[color,width,height,margin] hover:m-0 hover:size-8 hover:text-red-600"
          />
        )}
      </button>

      <button
        type="button"
        aria-label={`Delete ${plan.title}`}
        className="cursor-default rounded-md p-0.5 transition-colors hover:bg-red-600/15"
        onClick={handleDelete}
      >
        <TrashIcon weight="bold" className="size-7 text-red-600" />
      </button>
    </div>
  );
}
