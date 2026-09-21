"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { z } from "zod";
import { SearchBySubject } from "./search/SearchBySubject";
import { SearchByInstructor } from "./search/SearchByInstructor";
import { SearchByCRN } from "./search/SearchByCRN";

const VIEWS = ["subject", "instructor", "crn"] as const;
export type AddCourseView = (typeof VIEWS)[number];
const viewSchema = z.enum(VIEWS).catch("subject");

const TABS: { view: AddCourseView; label: string }[] = [
  { view: "subject", label: "By Subject" },
  { view: "instructor", label: "By Instructor" },
  { view: "crn", label: "By CRN" },
];

/** Props shared by the three add-course panels. */
export type PanelProps = {
  searchParams: ReadonlyURLSearchParams;
  /** Merge param updates into the URL; a `null`/empty value deletes the key. */
  setParams: (updates: Record<string, string | null>) => void;
};

/**
 * The "Add Courses" surface: three tabs (By Subject, By Instructor, By CRN).
 * The active tab and each tab's in-progress selection live in the URL search
 * params, so the state is shareable, survives refresh, and works with the back
 * button.
 */
export function AddCourses() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = viewSchema.parse(searchParams.get("view"));

  // Keep `setParams` stable (deps: router/pathname only) by reading the latest
  // params through a ref. A params-dependent setParams would change identity on
  // every URL update and re-fire the CRN panel's debounce effect.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParamsRef.current.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  const selectView = useCallback(
    (next: AddCourseView) => {
      // Switching tabs clears the other tabs' in-progress selection.
      const params = new URLSearchParams({ view: next });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  return (
    // The tab strip sits on top of the container: the tabs' bottom edge is flush
    // with the box's top, so they read as tabs attached to the panel.
    <div>
      <div role="tablist" aria-label="Add courses by" className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.view}
            type="button"
            role="tab"
            aria-selected={view === tab.view}
            data-active={view === tab.view}
            onClick={() => selectView(tab.view)}
            className="bg-surface-muted text-foreground/70 hover:text-foreground data-[active=true]:bg-primary flex-1 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors data-[active=true]:text-white"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="border-edge bg-surface rounded-b-xl border px-4 py-8 sm:px-8 sm:py-10">
        {view === "subject" && (
          <SearchBySubject searchParams={searchParams} setParams={setParams} />
        )}
        {view === "instructor" && (
          <SearchByInstructor
            searchParams={searchParams}
            setParams={setParams}
          />
        )}
        {view === "crn" && (
          <SearchByCRN searchParams={searchParams} setParams={setParams} />
        )}
      </div>
    </div>
  );
}
