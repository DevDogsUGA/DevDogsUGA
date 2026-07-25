"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "~/supabase/client";
import { useTerm } from "~/components/providers/TermProvider";
import { CourseSearchResult } from "~/components/courses/CourseSearchResult";
import type { OfferingSearchRow } from "~/types/course";

type CourseGroup = {
  courseId: number;
  abbr: string;
  courseNumber: string;
  title: string;
  maxCreditHours: number;
  offerings: OfferingSearchRow[];
};

export default function CourseSearchPage() {
  const { academicPeriod } = useTerm();
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(inputValue.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  const { data: rows = [], isFetching } = useQuery<OfferingSearchRow[]>({
    queryKey: ["offering-search", academicPeriod, query],
    enabled: !!academicPeriod && query.length > 0,
    queryFn: async () => {
      const numericCrn = parseInt(query);
      let req = supabase
        .from("offeringSearch")
        .select(
          "crn, courseId, abbr, courseNumber, title, maxCreditHours, firstName, lastName, seatsAvailable, active",
        )
        .eq("academicPeriod", academicPeriod!);

      if (!isNaN(numericCrn)) {
        req = req.or(`crn.eq.${numericCrn},search_vector.fts.${query}`);
      } else {
        req = req.textSearch("search_vector", query, { type: "websearch" });
      }

      const { data, error } = await req.limit(50);
      if (error) throw error;
      // The offeringSearch matview types every column as nullable; the query
      // selects the populated columns, so assert the app's row shape.
      return (data ?? []) as OfferingSearchRow[];
    },
  });

  // Group rows by course
  const courses = rows.reduce<CourseGroup[]>((acc, row) => {
    const existing = acc.find((c) => c.courseId === row.courseId);
    if (existing) {
      existing.offerings.push(row);
    } else {
      acc.push({
        courseId: row.courseId,
        abbr: row.abbr,
        courseNumber: row.courseNumber,
        title: row.title,
        maxCreditHours: row.maxCreditHours,
        offerings: [row],
      });
    }
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <input
          type="search"
          placeholder="Search by subject, course number, title, instructor, or CRN…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full rounded-md border-2 border-stone-300 bg-white px-3 py-2 pr-10 transition-[box-shadow,border-color] hover:shadow-sm not-disabled:hover:border-stone-400 focus:outline-none"
        />
        {isFetching && (
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-400">
            …
          </span>
        )}
      </div>

      {query.length > 0 && courses.length === 0 && !isFetching && (
        <p className="text-center text-sm text-neutral-500">
          No courses found.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {courses.map((course) => (
          <CourseSearchResult key={course.courseId} course={course} />
        ))}
      </div>
    </div>
  );
}
