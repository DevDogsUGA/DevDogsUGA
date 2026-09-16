"use client";

import { useState } from "react";
import { PlusCircleIcon } from "@phosphor-icons/react/ssr";
import type { OfferingSearchRow } from "~/types/course";
import { CourseSectionsDialog } from "./CourseSectionsDialog";
import { formatCourseCode } from "~/lib/courseCode";

type CourseGroup = {
  courseId: number;
  abbr: string;
  courseNumber: string;
  title: string;
  maxCreditHours: number;
  offerings: OfferingSearchRow[];
};

export function CourseSearchResult({ course }: { course: CourseGroup }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const instructorNames = [
    ...new Set(
      course.offerings
        .map((o) =>
          o.lastName ? `${o.firstName ?? ""} ${o.lastName}`.trim() : null,
        )
        .filter(Boolean),
    ),
  ].join(", ");

  return (
    <>
      <div className="border-edge bg-surface flex items-center justify-between rounded-sm border px-4 py-3">
        <div className="flex flex-col">
          <span className="font-bold">
            {formatCourseCode(course.abbr, course.courseNumber)}
          </span>
          <span className="text-foreground/80 text-sm">{course.title}</span>
          {instructorNames && (
            <span className="text-muted text-xs">{instructorNames}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted text-xs">{course.maxCreditHours} cr</span>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-accent hover:text-accent"
            title="Add course"
          >
            <PlusCircleIcon weight="bold" size={24} />
          </button>
        </div>
      </div>

      {dialogOpen && (
        <CourseSectionsDialog
          course={course}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
