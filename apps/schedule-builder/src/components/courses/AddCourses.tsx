"use client";

import type { Course } from "~/types/course";
import Link from "next/link";
import { ReadonlyURLSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PiPlusBold } from "react-icons/pi";
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
 *
 * @param view
 * @param state
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

  /**
   * When a new tab is selected, or the content in one of the
   * search fields changes, we update the search params of the
   * page to reflect said changes.
   */
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
   * Fires the provided event handler when a course is selected and the "Add Course" button is clicked.
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
          className="bg-pink-100 data-[active=true]:bg-red-700 w-1/3 rounded-bl-none rounded-br-none rounded-tl-lg rounded-tr-lg px-4 py-2 text-left font-bold capitalize text-[#CFBEBE] duration-150 data-[active=true]:text-white"
        >
          By Subject
        </Link>
        <Link
          href={instructorView.href}
          data-active={state.view === "instructor"}
          className="bg-pink-100 data-[active=true]:bg-red-700 w-1/3 rounded-bl-none rounded-br-none rounded-tl-lg rounded-tr-lg px-4 py-2 text-left font-bold capitalize text-[#CFBEBE] duration-150 data-[active=true]:text-white"
        >
          By Instructor
        </Link>
        <Link
          href={crnView.href}
          data-active={state.view === "crn"}
          className="bg-pink-100 data-[active=true]:bg-red-700 w-1/3 rounded-bl-none rounded-br-none rounded-tl-lg rounded-tr-lg px-4 py-2 text-left font-bold capitalize text-[#CFBEBE] duration-150 data-[active=true]:text-white"
        >
          By CRN
        </Link>
      </nav>

      <form
        className="border-pink-100 bg-pink-50 flex flex-col gap-16 border-4 px-8 py-10"
        onSubmit={handleSubmit}
      >
        {state.view === "subject" && <SearchBySubject {...subjectView} />}
        {state.view === "instructor" && (
          <SearchByInstructor {...instructorView} />
        )}
        {state.view === "crn" && <SearchByCRN {...crnView} />}

        <button
          className="bg-red-700 flex items-center gap-2 self-end rounded-md border-2 border-red-800 px-6 py-2 font-medium text-white transition-[background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60 not-disabled:hover:border-red-950 not-disabled:hover:bg-red-800 not-disabled:hover:shadow-md"
          disabled={course === null}
          type="submit"
        >
          <PiPlusBold />
          Add Course
        </button>
      </form>
    </div>
  );
}
