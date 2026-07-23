"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Navbar } from "~/components/Navbar";
import SavedPlan from "~/components/saved-plans/SavedPlan";
import DeletePlan from "~/components/ui/DeletePlan";
import { useSavedPlans } from "~/hooks/data/useSavedPlans";

export default function PlansListLayout({ children }: { children: ReactNode }) {
  const { savedPlans, updatePlan, deletePlan, isLoading } = useSavedPlans();
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);

  const sorted = savedPlans.toSorted((a, b) =>
    a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : 0,
  );

  return (
    <div className="bg-pink-50 min-h-screen">
      <Navbar />

      <div className="z-1 mb-0 ml-[10%] mr-[10%] mt-20 flex h-[8vh] items-stretch justify-between">
        <div className="flex w-[25%] overflow-y-auto rounded-t-lg border-l-2 border-r-2 border-t-2 border-black bg-red-700">
          <h1 className="mb-auto ml-auto mr-auto mt-auto text-4xl font-bold text-white">
            My Plans
          </h1>
        </div>
        <Link
          href="/plans/create"
          className="bg-red-700 my-auto rounded-lg px-6 py-3 text-lg font-bold text-white hover:bg-black"
        >
          Create
        </Link>
      </div>

      <div className="z-1 mb-10 ml-auto mr-auto mt-0 flex h-[85vh] w-4/5 flex-col flex-nowrap items-center gap-6 overflow-y-auto rounded-xl rounded-tl-none border-2 border-black bg-white py-10">
        {isLoading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 w-[90%] animate-pulse rounded-xl bg-neutral-200"
              />
            ))}
          </>
        ) : savedPlans.length === 0 ? (
          <div className="m-auto flex flex-col items-center justify-center">
            <h1 className="text-3xl font-bold">
              You don&apos;t have any saved plans yet.{" "}
            </h1>
            <Link
              href="/plans/create"
              className="bg-red-700 mt-5 rounded-lg px-8 py-4 text-xl font-bold text-white hover:bg-black"
            >
              Create
            </Link>
          </div>
        ) : (
          sorted.map((plan) => (
            <motion.div
              layout
              key={plan.id}
              transition={{ type: "spring", damping: 20, stiffness: 120, duration: 100 }}
              className="relative"
            >
              <SavedPlan
                plan={{ id: plan.id, title: plan.title, pinned: plan.pinned }}
                onPin={() => updatePlan.mutate({ id: plan.id, pinned: !plan.pinned })}
                onDelete={() => setPlanToDelete(plan.id)}
              />
            </motion.div>
          ))
        )}
      </div>

      {planToDelete && (
        <DeletePlan
          onConfirm={() => deletePlan.mutate(planToDelete, { onSuccess: () => setPlanToDelete(null) })}
          onCancel={() => setPlanToDelete(null)}
          planTitle={sorted.find((p) => p.id === planToDelete)?.title ?? ""}
        />
      )}

      {children}
    </div>
  );
}
