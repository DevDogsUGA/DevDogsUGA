"use client";

import { useMemo } from "react";
import Combobox from "~/components/ui/Combobox";
import { CourseSearchResult } from "~/components/courses/CourseSearchResult";
import { useTerm } from "~/components/providers/TermProvider";
import { useInstructors } from "~/hooks/queries/useInstructors";
import { useCoursesByInstructor } from "~/hooks/queries/useCoursesByInstructor";
import { formatCourseCode } from "~/lib/courseCode";
import type { PanelProps } from "~/components/courses/AddCourses";

const fullName = (i: { firstName: string; lastName: string }) =>
  `${i.firstName} ${i.lastName}`;

export function SearchByInstructor({ searchParams, setParams }: PanelProps) {
  const { academicPeriod } = useTerm();
  const instructorName = searchParams.get("instructor") ?? undefined;
  const courseAbbr = searchParams.get("course") ?? undefined;

  const { data: instructors = [] } = useInstructors();
  // Instructor names are unique (unique_full_name), so the name is a safe key.
  const selectedInstructor = instructors.find(
    (i) => fullName(i) === instructorName,
  );
  const { data: courses = [] } = useCoursesByInstructor(
    selectedInstructor?.id,
    academicPeriod,
  );
  const selectedCourse = courses.find((c) => c.abbr === courseAbbr);

  const instructorOptions = useMemo(
    () =>
      Object.fromEntries(instructors.map((i) => [fullName(i), fullName(i)])),
    [instructors],
  );

  const courseOptions = useMemo(
    () =>
      Object.fromEntries(
        courses.map((c) => [
          c.abbr,
          `${formatCourseCode(c.abbr, c.courseNumber)} — ${c.title}`,
        ]),
      ),
    [courses],
  );

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-4">
        <label className="contents">
          <span className="font-bold">Instructor</span>
          <Combobox
            key={`instructor-${instructorName ?? ""}`}
            defaultValue={instructorName}
            options={instructorOptions}
            searchPlaceholder="Search instructors…"
            onChange={(value) => {
              const next = value ? String(value) : null;
              if (next === (instructorName ?? null)) return;
              // Changing the instructor invalidates any chosen course.
              setParams({ instructor: next, course: null });
            }}
            displayText={(value) =>
              value != null ? String(value) : "Select an instructor"
            }
          />
        </label>

        <label className="contents">
          <span className="font-bold">Course</span>
          <Combobox
            key={`course-${instructorName ?? ""}-${courseAbbr ?? ""}`}
            defaultValue={courseAbbr}
            disabled={selectedInstructor === undefined}
            options={courseOptions}
            searchPlaceholder="Search courses…"
            onChange={(value) => {
              const next = value ? String(value) : null;
              if (next === (courseAbbr ?? null)) return;
              setParams({ course: next });
            }}
            displayText={(value) =>
              value != null
                ? (courseOptions[String(value)] ?? String(value))
                : selectedInstructor
                  ? "Select a course"
                  : "Awaiting instructor selection…"
            }
          />
        </label>
      </fieldset>

      {selectedCourse && (
        <CourseSearchResult course={{ ...selectedCourse, offerings: [] }} />
      )}
    </div>
  );
}
