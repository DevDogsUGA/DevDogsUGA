"use client";

import { type PropsWithChildren } from "react";
import { Navbar } from "~/components/Navbar";
import { SavedCourseItem } from "~/components/courses/SavedCourseItem";
import { useDraftCourses } from "~/hooks/data/useDraftCourses";

export default function Layout({ children }: PropsWithChildren) {
  const { draftCourses, removeCourse, isLoading } = useDraftCourses();

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pt-8 pb-4 md:px-6">
        <section className="flex grid-cols-3 grid-rows-[1fr] flex-col gap-8 md:grid">
          <div className="col-span-2 w-full">
            <h1 className="font-display p-2 pl-1 text-center text-3xl font-semibold md:text-left">
              Add Courses
            </h1>
            {/* The panel container lives in AddCourses so the tabs can sit on
                top of it. */}
            {children}
          </div>

          <div className="flex min-h-0 w-full flex-col">
            <h1 className="font-display p-2 pl-1 text-center text-3xl font-semibold md:text-left">
              Courses
            </h1>
            <div className="border-edge bg-surface relative min-h-64 flex-1 overflow-hidden rounded-xl border">
              <div className="shadow-inner-scroll-y absolute inset-0 flex flex-col gap-2 overflow-x-hidden overflow-y-scroll px-2 py-3">
                {isLoading ? (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="bg-surface-muted h-14 w-full animate-pulse rounded-sm"
                      />
                    ))}
                  </>
                ) : (
                  draftCourses.map((course) => (
                    <SavedCourseItem
                      key={course.id}
                      course={course}
                      onRemove={() => removeCourse.mutate(course.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
