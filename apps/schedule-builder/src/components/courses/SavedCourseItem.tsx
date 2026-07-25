"use client";

import { useState } from "react";
import {
  PiCursorClick,
  PiPlusCircleBold,
  PiTrashBold,
  PiXCircleBold,
} from "react-icons/pi";
import { CourseSectionsDialog } from "./CourseSectionsDialog";
import { type DraftCourse } from "~/lib/localStorage/types";

export type { DraftCourse };

export function SavedCourseItem({
  course,
  onRemove,
}: {
  course: DraftCourse;
  onRemove: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const info = course.courses[0];

  return (
    <div className="group relative rounded-sm border border-transparent transition-[border-color,box-shadow,background-color] hover:border-stone-500 hover:bg-stone-500/15 hover:shadow-sm">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="block w-full cursor-default px-2 pt-1 pr-8 pb-3.5 text-left perspective-distant"
      >
        <span className="flex items-center gap-1.5 overflow-hidden font-bold text-ellipsis">
          <PiPlusCircleBold className="text-lg text-green-700" />
          {info?.abbr} {info?.courseNumber}
        </span>
        <span className="block overflow-hidden pl-6 text-sm text-nowrap text-ellipsis">
          {info?.title}
        </span>
        {course.excludedCrns.length > 0 && (
          <span className="flex flex-col gap-0.5 pt-1 pl-7.5">
            <span className="-ml-1.5 block pb-0.5 text-[0.66rem] font-semibold text-neutral-500 uppercase">
              Excluding {course.excludedCrns.length} section
              {course.excludedCrns.length !== 1 ? "s" : ""}
            </span>
            {course.excludedCrns.map((crn) => (
              <span key={crn} className="flex items-center gap-1.5 text-sm">
                <PiXCircleBold className="text-base text-red-700" />
                CRN {crn}
              </span>
            ))}
          </span>
        )}
        <span className="absolute top-full right-2 flex origin-top scale-90 rotate-x-270 items-center gap-1 rounded-sm border border-red-700 bg-white px-2 py-px text-xs text-red-700 opacity-0 shadow-xs transition-[transform,scale,opacity,translate] group-hover:-translate-y-1/2 group-hover:scale-100 group-hover:rotate-x-360 group-hover:opacity-100">
          <PiCursorClick />
          Click to Edit Sections
        </span>
      </button>

      <button
        type="button"
        onClick={onRemove}
        title="Remove course"
        className="absolute top-1.5 right-1.5 rounded-sm p-1 text-neutral-400 transition-colors hover:bg-red-700/10 hover:text-red-700"
      >
        <PiTrashBold />
      </button>

      {dialogOpen && info && (
        <CourseSectionsDialog
          course={{
            courseId: course.courseId,
            abbr: info.abbr,
            courseNumber: info.courseNumber,
            title: info.title,
          }}
          initialExcludedCrns={course.excludedCrns}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
