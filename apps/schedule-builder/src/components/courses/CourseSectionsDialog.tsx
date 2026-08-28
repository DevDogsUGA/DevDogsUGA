"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";
import { useOfferingsByCourse } from "~/hooks/queries/useOfferingsByCourse";
import { useDraftCourses } from "~/hooks/data/useDraftCourses";
import { useTerm } from "~/components/providers/TermProvider";
import { SectionExclusionList } from "./SectionExclusionList";

export function CourseSectionsDialog({
  course,
  initialExcludedCrns,
  onClose,
}: {
  course: {
    courseId: number;
    abbr: string;
    courseNumber: string;
    title: string;
  };
  initialExcludedCrns?: number[];
  onClose: () => void;
}) {
  const isEditing = initialExcludedCrns !== undefined;
  const { academicPeriod } = useTerm();
  const { data: offerings = [] } = useOfferingsByCourse(
    course.courseId,
    academicPeriod!,
  );
  const [excludedCrns, setExcludedCrns] = useState<Set<number>>(
    new Set(initialExcludedCrns),
  );
  const { upsertCourse } = useDraftCourses();

  function toggleExclude(crn: number) {
    setExcludedCrns((prev) => {
      const next = new Set(prev);
      if (next.has(crn)) next.delete(crn);
      else next.add(crn);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl bg-pink-50 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">
              {course.abbr} {course.courseNumber}
            </h2>
            <p className="text-sm text-neutral-600">{course.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-black"
          >
            <XIcon weight="bold" size={20} />
          </button>
        </div>

        {/* Offering list */}
        <div className="max-h-80 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-sm text-neutral-500">
            Uncheck sections to exclude them from schedule generation.
          </p>
          <SectionExclusionList
            offerings={offerings}
            excludedCrns={excludedCrns}
            onToggle={toggleExclude}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              upsertCourse.mutate(
                {
                  courseId: course.courseId,
                  abbr: course.abbr,
                  courseNumber: course.courseNumber,
                  title: course.title,
                  excludedCrns: [...excludedCrns],
                },
                { onSuccess: onClose },
              )
            }
            disabled={upsertCourse.isPending}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {upsertCourse.isPending
              ? "Saving…"
              : isEditing
                ? "Save Changes"
                : "Add Course"}
          </button>
        </div>
      </div>
    </div>
  );
}
