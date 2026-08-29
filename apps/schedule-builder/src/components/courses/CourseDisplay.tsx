"use client";

import type { Course } from "~/types/course";
import { type ReadonlyURLSearchParams } from "next/navigation";
import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { AddCourses } from "./AddCourses";
import RegisteredClass from "./RegisteredClass";

interface Props {
  /**
   * Courses to be included in the schedule plan
   */
  courses: Course[];
  /**
   * Fires the provided event handler when a course is selected and the "Add Course" button is clicked.
   * @param course The selected course.
   */
  onAddCourse?: (course: Course) => void;
  /**
   * Fires the provided event handler when a course is removed from the plan
   * @param course The course to remove
   */
  onRemoveCourse?: (course: Course) => void;
  /**
   *  The current URL search params.
   */
  searchParams: ReadonlyURLSearchParams;
}

export default function CourseDisplay({
  searchParams,
  courses,
  onAddCourse,
  onRemoveCourse,
}: Props) {
  return (
    <section className="flex flex-col gap-8 md:flex-row">
      <div className="w-full md:w-2/3">
        <h1 className="p-2 pl-1 text-center text-3xl font-black md:text-left">
          Add Courses
        </h1>
        <AddCourses searchParams={searchParams} onAddCourse={onAddCourse} />
      </div>
      <div className="w-full md:w-1/3">
        <h1 className="p-2 pl-1 text-center text-3xl font-black md:text-left">
          Courses
        </h1>
        <div className="relative">
          {/* Container for course list */}
          <div className="no-scrollbar relative flex flex-1 flex-col overflow-x-hidden overflow-y-scroll scroll-smooth border-4 border-pink-100 bg-white py-4">
            {/*Course item */}
            {courses.map((course) => (
              <RegisteredClass
                key={course.courseId}
                subject={course.subject ?? ""}
                courseNumber={course.courseNumber ?? ""}
                courseName={course.athenaTitle ?? ""}
                onClick={() => onRemoveCourse?.(course)}
              />
            ))}
          </div>
          {/* Styling div to add spacing and hold down arrow notification in case there is more items */}
          <div className="absolute bottom-0 left-0 flex h-6 w-full justify-center border-4 border-t-0 border-pink-100 bg-white">
            {courses.length > 5 && (
              <CaretDownIcon
                weight="bold"
                className="size-30 h-auto w-auto animate-bounce"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
