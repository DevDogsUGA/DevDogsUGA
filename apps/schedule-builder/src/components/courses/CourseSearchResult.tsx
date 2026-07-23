"use client";

import { useState } from "react";
import { PiPlusCircleBold } from "react-icons/pi";
import type { OfferingSearchRow } from "~/types/course";
import { CourseSectionsDialog } from "./CourseSectionsDialog";

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
          o.lastName
            ? `${o.firstName ?? ""} ${o.lastName}`.trim()
            : null,
        )
        .filter(Boolean),
    ),
  ].join(", ");

  return (
    <>
      <div className="border-pink-100 flex items-center justify-between rounded-sm border bg-white px-4 py-3">
        <div className="flex flex-col">
          <span className="font-bold">
            {course.abbr} {course.courseNumber}
          </span>
          <span className="text-sm text-neutral-600">{course.title}</span>
          {instructorNames && (
            <span className="text-xs text-neutral-400">{instructorNames}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {course.maxCreditHours} cr
          </span>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-red-700 hover:text-red-800"
            title="Add course"
          >
            <PiPlusCircleBold size={24} />
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
