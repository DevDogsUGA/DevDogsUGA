"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
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
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 md:px-6">
        <div className="flex items-center justify-between gap-4 pb-6">
          <h1 className="font-display text-3xl font-semibold">My Plans</h1>
          <Link
            href="/plans/create"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-primary-strong"
          >
            <PlusIcon weight="bold" /> Create
          </Link>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 w-full animate-pulse rounded-xl bg-surface-muted"
              />
            ))}
          </div>
        ) : savedPlans.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-edge-strong px-6 py-16 text-center">
            <h2 className="text-xl font-semibold">
              You don&apos;t have any saved plans yet.
            </h2>
            <p className="max-w-sm text-balance text-sm text-muted">
              Add some courses, set your preferences, and generate your first
              schedule.
            </p>
            <Link
              href="/plans/create"
              className="mt-2 rounded-lg bg-primary px-6 py-2.5 font-semibold text-white transition-colors hover:bg-primary-strong"
            >
              Create a Plan
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sorted.map((plan) => (
              <motion.div
                layout
                key={plan.id}
                transition={{
                  type: "spring",
                  damping: 20,
                  stiffness: 120,
                  duration: 100,
                }}
                className="relative"
              >
                <SavedPlan
                  plan={{ id: plan.id, title: plan.title, pinned: plan.pinned }}
                  onPin={() =>
                    updatePlan.mutate({ id: plan.id, pinned: !plan.pinned })
                  }
                  onDelete={() => setPlanToDelete(plan.id)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {planToDelete && (
        <DeletePlan
          onConfirm={() =>
            deletePlan.mutate(planToDelete, {
              onSuccess: () => setPlanToDelete(null),
            })
          }
          onCancel={() => setPlanToDelete(null)}
          planTitle={sorted.find((p) => p.id === planToDelete)?.title ?? ""}
        />
      )}

      {children}
    </div>
  );
}
