import { Error } from "~/components/Toasts";
import Combobox from "~/components/ui/Combobox";
import useToast from "~/hooks/useToast";
import { useCoursesBySubject } from "~/hooks/queries/useCoursesBySubject";
import { useSubjects } from "~/hooks/queries/useSubjects";
import type { Course } from "~/types/course";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkSlashIcon } from "@phosphor-icons/react/ssr";

type InputState =
  | Record<string, never>
  | { subject: string }
  | { subject: string; course: string };

interface Props {
  defaultValue?: InputState;
  onChange?: (course: Course | null) => void;
  onInput?: (value: InputState) => void;
}

export default function SearchBySubject({
  defaultValue,
  onChange,
  onInput,
}: Props) {
  const [subject, setSubject] = useState(defaultValue?.subject);
  const dispatchError = useToast(Error);

  const subjectsQuery = useSubjects();
  const coursesQuery = useCoursesBySubject(subject);

  const subjectOptions = useMemo(
    () =>
      subjectsQuery.data &&
      Object.fromEntries(subjectsQuery.data.map((v) => [v, v])),
    [subjectsQuery.data],
  );

  const courseOptions = useMemo(
    () =>
      coursesQuery.data &&
      Object.fromEntries(
        coursesQuery.data.map((c) => [
          String(c.courseId),
          `(${c.courseNumber}) ${c.title}`,
        ]),
      ),
    [coursesQuery.data],
  );

  const handleSubjectChange = useCallback(
    (value: string | number | undefined) => {
      const v = value != null ? String(value) : undefined;
      setSubject(v);
      onInput?.(v ? { subject: v } : {});
    },
    [onInput],
  );

  const handleCourseChange = useCallback(
    (courseId: string | number | undefined) => {
      if (subject === undefined) return;
      const id = Number(courseId);
      const course = coursesQuery.data?.find((c) => c.courseId === id);
      if (course === undefined) {
        onChange?.(null);
        return;
      }
      onInput?.({ subject, course: String(courseId!) });
      onChange?.(course);
    },
    [onChange, coursesQuery.data, subject, onInput],
  );

  useEffect(() => {
    if (!(defaultValue && "subject" in defaultValue && subjectsQuery.data))
      return;
    if (!subjectsQuery.data.includes(defaultValue.subject)) {
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
    onInput?.({ subject: defaultValue.subject });
    onChange?.(null);
  }, [defaultValue, subjectsQuery.data, coursesQuery.data, onChange, onInput]);

  useEffect(() => {
    if (subjectsQuery.error)
      dispatchError({
        icon: NetworkSlashIcon,
        message: "Could not load subjects.",
      });
  }, [subjectsQuery.error, dispatchError]);

  useEffect(() => {
    if (coursesQuery.error)
      dispatchError({
        icon: NetworkSlashIcon,
        message: "Could not load courses.",
      });
  }, [coursesQuery.error, dispatchError]);

  return (
    <fieldset className="grid w-full max-w-96 grid-cols-[max-content_1fr] grid-rows-2 items-center gap-x-3 gap-y-8">
      <label className="contents">
        <span className="text-lg font-bold">Subject:</span>
        <Combobox
          defaultValue={defaultValue?.subject}
          options={subjectOptions}
          searchPlaceholder="Search subjects..."
          displayText={(v) => (v != null ? String(v) : "Select a Subject")}
          onChange={handleSubjectChange}
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
          disabled={subject === undefined}
          options={courseOptions}
          onChange={handleCourseChange}
          searchPlaceholder={`Search ${subject} courses...`}
          displayText={(v) =>
            v != null
              ? (courseOptions?.[String(v)] ?? String(v))
              : subject
                ? `Select a ${subject} Course`
                : "Awaiting Subject Selection..."
          }
        />
      </label>
    </fieldset>
  );
}
