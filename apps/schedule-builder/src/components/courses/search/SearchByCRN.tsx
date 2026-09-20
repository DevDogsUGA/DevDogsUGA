"use client";

import { useEffect, useRef, useState } from "react";
import { CourseSearchResult } from "~/components/courses/CourseSearchResult";
import { useTerm } from "~/components/providers/TermProvider";
import { useOfferingByCrn } from "~/hooks/queries/useOfferingByCrn";
import type { PanelProps } from "~/components/courses/AddCourses";

/** A CRN is a positive integer within Postgres `int4` range. */
function parseCrn(value: string): number | undefined {
  return /^\d{1,9}$/.test(value) && Number(value) <= 2147483647
    ? Number(value)
    : undefined;
}

export function SearchByCRN({ searchParams, setParams }: PanelProps) {
  const { academicPeriod } = useTerm();
  const [inputValue, setInputValue] = useState(
    () => searchParams.get("crn") ?? "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror the input into the URL (debounced) so the lookup is shareable.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setParams({ crn: inputValue.trim() || null }),
      300,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, setParams]);

  const crn = parseCrn(inputValue.trim());
  const {
    data: result,
    isFetching,
    error,
  } = useOfferingByCrn(crn, academicPeriod);

  return (
    <div className="flex flex-col gap-6">
      <label className="grid grid-cols-[7rem_1fr] items-center gap-x-3">
        <span className="font-bold">CRN</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          placeholder="Enter a CRN…"
          value={inputValue}
          onChange={(e) =>
            setInputValue(e.target.value.replace(/\D/g, "").slice(0, 9))
          }
          className="border-edge-strong bg-surface not-disabled:hover:border-muted w-full rounded-md border-2 px-3 py-1.5 transition-[box-shadow,border-color] hover:shadow-sm focus:outline-none"
        />
      </label>

      {crn != null && error && !isFetching && (
        <p role="alert" className="text-sm text-red-700">
          CRN lookup failed. Please try again.
        </p>
      )}

      {crn != null && !isFetching && !error && result === null && (
        <p className="text-muted text-sm">
          No course found for CRN {crn} in this term.
        </p>
      )}

      {result && (
        <CourseSearchResult
          course={{ ...result.course, offerings: [] }}
          includeOnlyCrn={result.crn}
        />
      )}
    </div>
  );
}
