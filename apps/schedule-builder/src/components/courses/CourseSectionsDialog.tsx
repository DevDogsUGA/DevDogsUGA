"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";
import { useOfferingsByCourse } from "~/hooks/queries/useOfferingsByCourse";
import { useDraftCourses } from "~/hooks/data/useDraftCourses";
import { useTerm } from "~/components/providers/TermProvider";
import { SectionExclusionList } from "./SectionExclusionList";
import { formatCourseCode } from "~/lib/courseCode";

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
      <div className="bg-surface w-full max-w-lg rounded-xl shadow-xl">
        {/* Header */}
        <div className="border-edge flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">
              {formatCourseCode(course.abbr, course.courseNumber)}
            </h2>
            <p className="text-foreground/80 text-sm">{course.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            <XIcon weight="bold" size={20} />
          </button>
        </div>

        {/* Offering list */}
        <div className="max-h-80 overflow-y-auto px-6 py-4">
          <p className="text-muted mb-3 text-sm">
            Uncheck sections to exclude them from schedule generation.
          </p>
          <SectionExclusionList
            offerings={offerings}
            excludedCrns={excludedCrns}
            onToggle={toggleExclude}
          />
        </div>

        {/* Footer */}
        <div className="border-edge flex justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="text-foreground/80 hover:bg-surface-muted rounded-md px-4 py-2 text-sm font-medium"
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
            className="bg-primary hover:bg-primary-strong rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
