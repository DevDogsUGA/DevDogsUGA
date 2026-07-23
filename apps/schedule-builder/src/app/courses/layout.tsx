"use client";

import { type PropsWithChildren } from "react";
import { Navbar } from "~/components/Navbar";
import { SavedCourseItem } from "~/components/courses/SavedCourseItem";
import { useDraftCourses } from "~/hooks/data/useDraftCourses";
import background from "../../../public/images/background.png";

export default function Layout({ children }: PropsWithChildren) {
  const { draftCourses, removeCourse, isLoading } = useDraftCourses();

  return (
    <main
      className="min-h-screen bg-cover bg-fixed bg-bottom bg-no-repeat"
      style={{ backgroundImage: `url(${background.src})` }}
    >
      <Navbar />
      <div className="flex flex-col gap-8 px-4 pt-8 pb-4 xl:px-24">
        <section className="flex grid-cols-3 grid-rows-[1fr] flex-col gap-8 md:grid">
          <div className="col-span-2 w-full">
            <h1 className="p-2 pl-1 text-center text-3xl font-black md:text-left">
              Add Courses
            </h1>
            <div className="h-full min-w-full">
              <div className="border-pink-100 bg-pink-50 flex flex-col gap-16 border-4 px-8 py-10">
                {children}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 w-full flex-col">
            <h1 className="p-2 pl-1 text-center text-3xl font-black md:text-left">
              Courses
            </h1>
            <div className="border-pink-100 relative flex-1 border-4 bg-white">
              <div className="shadow-inner-scroll-y absolute inset-0 flex flex-col gap-2 overflow-x-hidden overflow-y-scroll px-2 py-3">
                {isLoading ? (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 w-full animate-pulse rounded-sm bg-neutral-200"
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
