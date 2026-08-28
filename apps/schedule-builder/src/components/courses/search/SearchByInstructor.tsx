import { Error } from "~/components/Toasts";
import Combobox from "~/components/ui/Combobox";
import useToast from "~/hooks/useToast";
import { useCoursesByInstructor } from "~/hooks/queries/useCoursesByInstructor";
import { useInstructors } from "~/hooks/queries/useInstructors";
import type { Course } from "~/types/course";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkSlashIcon } from "@phosphor-icons/react/ssr";

type InputState =
  | Record<string, never>
  | { instructor: string }
  | { instructor: string; course: string };

interface Props {
  defaultValue?: InputState;
  onChange?: (course: Course | null) => void;
  onInput?: (value: InputState) => void;
}

export default function SearchByInstructor({
  defaultValue,
  onChange,
  onInput,
}: Props) {
  const [instructor, setInstructor] = useState(defaultValue?.instructor);
  const dispatchError = useToast(Error);

  const instructorsQuery = useInstructors();
  const coursesQuery = useCoursesByInstructor(instructor);

  const instructorOptions = useMemo(
    () =>
      instructorsQuery.data &&
      Object.fromEntries(instructorsQuery.data.map((name) => [name, name])),
    [instructorsQuery.data],
  );

  const courseOptions = useMemo(
    () =>
      coursesQuery.data &&
      Object.fromEntries(
        coursesQuery.data.map((c) => [
          String(c.courseId),
          `(${c.courseNumber}) ${c.athenaTitle}`,
        ]),
      ),
    [coursesQuery.data],
  );

  const handleInstructorChange = useCallback(
    (value: string | number | undefined) => {
      const v = value != null ? String(value) : undefined;
      setInstructor(v);
      onInput?.(v ? { instructor: v } : {});
    },
    [onInput],
  );

  const handleCourseChange = useCallback(
    (courseId: string | number | undefined) => {
      if (instructor === undefined) return;
      const id = Number(courseId);
      const course = coursesQuery.data?.find((c) => c.courseId === id);
      if (course === undefined) {
        onChange?.(null);
        return;
      }
      onInput?.({ instructor, course: String(courseId!) });
      onChange?.(course);
    },
    [onChange, coursesQuery.data, instructor, onInput],
  );

  useEffect(() => {
    if (!(
      defaultValue &&
      "instructor" in defaultValue &&
      instructorsQuery.data
    ))
      return;
    if (!instructorsQuery.data.includes(defaultValue.instructor)) {
      onInput?.({});
      onChange?.(null);
      return;
    }
    if (!("course" in defaultValue && coursesQuery.data)) return;
    const course = coursesQuery.data.find(
      (c) => c.courseId === Number(defaultValue.course),
    );
    if (course !== undefined) {
      onChange?.(course);
      return;
    }
    onInput?.({ instructor: defaultValue.instructor });
    onChange?.(null);
  }, [
    defaultValue,
    instructorsQuery.data,
    coursesQuery.data,
    onChange,
    onInput,
  ]);

  useEffect(() => {
    if (instructorsQuery.error)
      dispatchError({
        icon: NetworkSlashIcon,
        message: "Could not load instructors.",
      });
  }, [instructorsQuery.error, dispatchError]);

  useEffect(() => {
    if (coursesQuery.error)
      dispatchError({
        icon: NetworkSlashIcon,
        message: "Could not load courses.",
      });
  }, [coursesQuery.error, dispatchError]);

  const lastName = instructor?.split(" ").slice(1).join(" ") ?? "";

  return (
    <fieldset className="grid w-full max-w-96 grid-cols-[max-content_1fr] grid-rows-2 items-center gap-x-3 gap-y-6">
      <label className="contents">
        <span className="text-lg font-bold">Instructor:</span>
        <Combobox
          defaultValue={defaultValue?.instructor}
          options={instructorOptions}
          searchPlaceholder="Search instructors..."
          displayText={(v) => (v != null ? String(v) : "Select an Instructor")}
          onChange={handleInstructorChange}
        />
      </label>

      <label className="contents">
        <span className="text-lg font-bold">Course:</span>
        <Combobox
          defaultValue={
            defaultValue && "course" in defaultValue
              ? defaultValue.course
              : undefined
          }
          disabled={instructor === undefined}
          options={courseOptions}
          onChange={handleCourseChange}
          searchPlaceholder={`Search ${lastName} courses...`}
          displayText={(v) =>
            v != null
              ? (courseOptions?.[String(v)] ?? String(v))
              : instructor
                ? `Select a ${lastName} Course`
                : "Awaiting Instructor Selection..."
          }
        />
      </label>
    </fieldset>
  );
}
