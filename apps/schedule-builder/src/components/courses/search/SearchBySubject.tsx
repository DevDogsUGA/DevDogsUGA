"use client";

import { useMemo } from "react";
import Combobox from "~/components/ui/Combobox";
import { CourseSearchResult } from "~/components/courses/CourseSearchResult";
import { useTerm } from "~/components/providers/TermProvider";
import { useSubjects } from "~/hooks/queries/useSubjects";
import { useCoursesBySubject } from "~/hooks/queries/useCoursesBySubject";
import { formatCourseCode } from "~/lib/courseCode";
import type { PanelProps } from "~/components/courses/AddCourses";

export function SearchBySubject({ searchParams, setParams }: PanelProps) {
  const { academicPeriod } = useTerm();
  const subjectAbbr = searchParams.get("subject") ?? undefined;
  const courseAbbr = searchParams.get("course") ?? undefined;

  const { data: subjects = [] } = useSubjects();
  const selectedSubject = subjects.find((s) => s.abbr === subjectAbbr);
  const { data: courses = [] } = useCoursesBySubject(
    selectedSubject?.id,
    academicPeriod,
  );
  const selectedCourse = courses.find((c) => c.abbr === courseAbbr);

  const subjectOptions = useMemo(
    () =>
      Object.fromEntries(
        subjects.map((s) => [s.abbr, `${s.abbr} — ${s.description}`]),
      ),
    [subjects],
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
          <span className="font-bold">Subject</span>
          <Combobox
            key={`subject-${subjectAbbr ?? ""}`}
            defaultValue={subjectAbbr}
            options={subjectOptions}
            searchPlaceholder="Search subjects…"
            onChange={(value) => {
              const next = value ? String(value) : null;
              if (next === (subjectAbbr ?? null)) return;
              // Changing the subject invalidates any chosen course.
              setParams({ subject: next, course: null });
            }}
            displayText={(value) =>
              value != null
                ? (subjectOptions[String(value)] ?? String(value))
                : "Select a subject"
            }
          />
        </label>

        <label className="contents">
          <span className="font-bold">Course</span>
          <Combobox
            key={`course-${subjectAbbr ?? ""}-${courseAbbr ?? ""}`}
            defaultValue={courseAbbr}
            disabled={selectedSubject === undefined}
            options={courseOptions}
            searchPlaceholder={`Search ${subjectAbbr ?? ""} courses…`}
            onChange={(value) => {
              const next = value ? String(value) : null;
              if (next === (courseAbbr ?? null)) return;
              setParams({ course: next });
            }}
            displayText={(value) =>
              value != null
                ? (courseOptions[String(value)] ?? String(value))
                : selectedSubject
                  ? `Select a ${selectedSubject.abbr} course`
                  : "Awaiting subject selection…"
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
