import { Error } from "~/components/Toasts";
import Combobox from "~/components/ui/Combobox";
import useToast from "~/hooks/useToast";
import { useCourseDetailsByCrn } from "~/hooks/queries/useCourseDetailsByCrn";
import { useCrns } from "~/hooks/queries/useCrns";
import type { Course } from "~/types/course";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkSlashIcon } from "@phosphor-icons/react/ssr";

type InputState = Record<string, never> | { crn: string };

interface Props {
  defaultValue?: InputState;
  onChange?: (course: Course | null) => void;
  onInput?: (value: InputState) => void;
}

export default function SearchByCRN({
  defaultValue,
  onChange,
  onInput,
}: Props) {
  const [crn, setCRN] = useState(defaultValue?.crn);
  const dispatchError = useToast(Error);

  const crnsQuery = useCrns();
  const courseQuery = useCourseDetailsByCrn(crn);

  const crnOptions = useMemo(
    () =>
      crnsQuery.data &&
      Object.fromEntries(crnsQuery.data.map((c) => [String(c), String(c)])),
    [crnsQuery.data],
  );

  const course = courseQuery.data ?? null;

  const handleCrnChange = useCallback(
    (value: string | number | undefined) => {
      const v = value != null ? String(value) : undefined;
      setCRN(v);
      onInput?.(v ? { crn: v } : {});
    },
    [onInput],
  );

  // Clear the restored selection only when the CRN turns out NOT to exist in
  // this term, matching SearchBySubject/SearchByInstructor. Clearing on a
  // *valid* CRN wiped a good `?crn=` param the moment the list resolved.
  useEffect(() => {
    if (!(defaultValue && "crn" in defaultValue && crnsQuery.data)) return;
    if (!crnsQuery.data.includes(Number(defaultValue.crn))) {
      onInput?.({});
      onChange?.(null);
    }
  }, [defaultValue, crnsQuery.data, onChange, onInput]);

  useEffect(() => {
    onChange?.(course);
  }, [onChange, course]);

  useEffect(() => {
    if (crnsQuery.error)
      dispatchError({
        icon: NetworkSlashIcon,
        message: "Could not load CRNs.",
      });
  }, [crnsQuery.error, dispatchError]);

  useEffect(() => {
    if (courseQuery.error)
      dispatchError({
        icon: NetworkSlashIcon,
        message: "Could not load course details.",
      });
  }, [courseQuery.error, dispatchError]);

  return (
    <fieldset className="grid w-full max-w-96 grid-cols-[max-content_1fr] grid-rows-[max-content_1fr] items-center gap-x-3 gap-y-3">
      <label className="contents">
        <span className="text-lg font-bold">CRN:</span>
        <Combobox
          defaultValue={defaultValue?.crn}
          options={crnOptions}
          searchPlaceholder="Search CRNs..."
          displayText={(v) => (v != null ? String(v) : "Select a CRN")}
          onChange={handleCrnChange}
        />
      </label>

      {course && (
        <article className="col-start-2 flex flex-col rounded-md border border-dashed border-red-700 bg-white px-3 py-2 text-sm text-red-900 shadow-inner">
          <h3 className="font-semibold">
            {course.subject} {course.courseNumber}
          </h3>
          <p className="italic">{course.athenaTitle}</p>
        </article>
      )}
    </fieldset>
  );
}
