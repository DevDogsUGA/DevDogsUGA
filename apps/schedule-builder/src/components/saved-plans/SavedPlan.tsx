"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PiHeartBold, PiHeartFill, PiTrashBold } from "react-icons/pi";

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
      className="relative z-10 flex w-[70vw] cursor-pointer flex-row items-center gap-4 rounded-xl border-b-8 border-red-700 bg-white px-7 py-4 ring-2 ring-black hover:mt-1 hover:border-b-4 hover:border-red-700 hover:bg-neutral-100 [&:active:not(:has(input:hover,button:hover))]:border-b-0 [&:active:not(:has(input:hover,button:hover))]:border-t-4"
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
      <button type="button" className="cursor-default" onClick={handlePin}>
        {plan.pinned ? (
          <PiHeartFill className="text-red-600 size-8 transition" />
        ) : (
          <PiHeartBold className="hover:text-red-600 m-0.5 size-7 transition-[color,width,height,margin] hover:m-0 hover:size-8" />
        )}
      </button>

      <button
        type="button"
        className="hover:bg-red-600/15 cursor-default rounded-md p-0.5 transition-colors"
      >
        <PiTrashBold
          className="text-red-600 size-7"
          onClick={handleDelete}
        />
      </button>
    </div>
  );
}
