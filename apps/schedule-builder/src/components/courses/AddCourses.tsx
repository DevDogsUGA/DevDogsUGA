"use client";

import type { Course } from "~/types/course";
import Link from "next/link";
import { type ReadonlyURLSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import * as z from "zod";
import SearchByCRN from "./search/SearchByCRN";
import SearchByInstructor from "./search/SearchByInstructor";
import SearchBySubject from "./search/SearchBySubject";

const searchParamsState = z
  .union([
    z.object({
      view: z.literal("subject"),
      subject: z.string(),
      course: z.string().optional(),
    }),
    z.object({
      view: z.literal("subject"),
      subject: z.string().optional(),
    }),
    z.object({
      view: z.literal("instructor"),
      instructor: z.string(),
      course: z.string().optional(),
    }),
    z.object({
      view: z.literal("instructor"),
      instructor: z.string().optional(),
    }),
    z.object({
      view: z.literal("crn"),
      crn: z.string().optional(),
    }),
  ])
  .catch({
    view: "subject",
  });

/**
 * Per-tab state: the selected course, the last values typed into that tab's
 * fields, and the href that restores them.
 */
function useTab<T extends z.infer<typeof searchParamsState>["view"]>(
  view: T,
  state: z.infer<typeof searchParamsState>,
) {
  const router = useRouter();
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [defaultValue, setDefaultValue] = useState(() => {
    if (state.view === view) {
      return state;
    }

    return {};
  });

  const href = useMemo(
    () => "?" + new URLSearchParams({ view, ...defaultValue }).toString(),
    [view, defaultValue],
  );

  // Mirror the active tab and its field values into the page's search params.
  useEffect(() => {
    if (state.view === view) {
      router.replace(href);
    }
  }, [state.view, view, router, href]);

  return {
    onChange: setSelectedCourse,
    onInput: setDefaultValue,
    selectedCourse,
    defaultValue,
    href,
  };
}

interface Props {
  /**
   * The current URL search params.
   */
  searchParams: ReadonlyURLSearchParams;
  /**
   * Called when a course is selected and the "Add Course" button is clicked.
   * @param course The selected course.
   */
  onAddCourse?: (course: Course) => void;
}

export function AddCourses({ onAddCourse, searchParams }: Props) {
  const state = useMemo(
    () => searchParamsState.parse(searchParams),
    [searchParams],
  );

  const subjectView = useTab("subject", state);
  const instructorView = useTab("instructor", state);
  const crnView = useTab("crn", state);

  const course = useMemo(() => {
    switch (state.view) {
      case "subject":
        return subjectView.selectedCourse;
      case "instructor":
        return instructorView.selectedCourse;
      case "crn":
        return crnView.selectedCourse;
    }
  }, [state.view, subjectView, instructorView, crnView]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.currentTarget.reset();

      if (!onAddCourse || course === null) {
        return;
      }

      onAddCourse(course);
    },
    [onAddCourse, course],
  );

  console.log(course);

  return (
    <div className="h-full min-w-full">
      <nav className="flex gap-2">
        <Link
          href={subjectView.href}
          data-active={state.view === "subject"}
          className="w-1/3 rounded-tl-lg rounded-tr-lg rounded-br-none rounded-bl-none bg-pink-100 px-4 py-2 text-left font-bold text-[#CFBEBE] capitalize duration-150 data-[active=true]:bg-red-700 data-[active=true]:text-white"
        >
          By Subject
        </Link>
        <Link
          href={instructorView.href}
          data-active={state.view === "instructor"}
          className="w-1/3 rounded-tl-lg rounded-tr-lg rounded-br-none rounded-bl-none bg-pink-100 px-4 py-2 text-left font-bold text-[#CFBEBE] capitalize duration-150 data-[active=true]:bg-red-700 data-[active=true]:text-white"
        >
          By Instructor
        </Link>
        <Link
          href={crnView.href}
          data-active={state.view === "crn"}
          className="w-1/3 rounded-tl-lg rounded-tr-lg rounded-br-none rounded-bl-none bg-pink-100 px-4 py-2 text-left font-bold text-[#CFBEBE] capitalize duration-150 data-[active=true]:bg-red-700 data-[active=true]:text-white"
        >
          By CRN
        </Link>
      </nav>

      <form
        className="flex flex-col gap-16 border-4 border-pink-100 bg-pink-50 px-8 py-10"
        onSubmit={handleSubmit}
      >
        {state.view === "subject" && <SearchBySubject {...subjectView} />}
        {state.view === "instructor" && (
          <SearchByInstructor {...instructorView} />
        )}
        {state.view === "crn" && <SearchByCRN {...crnView} />}

        <button
          className="flex items-center gap-2 self-end rounded-md border-2 border-red-800 bg-red-700 px-6 py-2 font-medium text-white transition-[background-color,border-color,box-shadow] not-disabled:hover:border-red-950 not-disabled:hover:bg-red-800 not-disabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          disabled={course === null}
          type="submit"
        >
          <PlusIcon weight="bold" />
          Add Course
        </button>
      </form>
    </div>
  );
}
