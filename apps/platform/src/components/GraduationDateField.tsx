"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { getProfilePageData } from "~/server/loaders/console";
import Select from "~/components/Select";
import SettingsField from "~/ui/settings-field";
import updateGraduation from "~/server/actions/updateGraduation";
import {
  isGraduationInPast,
  validateGraduation,
  type Semester,
} from "~/lib/validation/profile";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;

/**
 * Greys out a semester that has already finished this year, so the common case
 * never reaches validation at all. The message from `validateGraduation` is
 * the backstop for the rest: picking a year first, then a stale semester.
 */
function isSemesterDisabled(sem: Semester, selectedYear: string): boolean {
  const currentYear = new Date().getFullYear();
  if (!selectedYear || parseInt(selectedYear, 10) !== currentYear) return false;
  return isGraduationInPast(sem, currentYear);
}

export default function GraduationDateField({ profile }: ProfileData) {
  const [semester, setSemester] = useState<Semester | "">(
    profile.graduationSemester ?? "",
  );
  const [year, setYear] = useState(profile.graduationYear?.toString() ?? "");
  const [savedSemester, setSavedSemester] = useState(
    profile.graduationSemester ?? "",
  );
  const [savedYear, setSavedYear] = useState(
    profile.graduationYear?.toString() ?? "",
  );

  const mutation = useMutation({
    mutationFn: async ({ sem, yr }: { sem: Semester | ""; yr: string }) => {
      const result = await updateGraduation(
        sem || null,
        yr ? parseInt(yr, 10) : null,
      );
      // Rejecting rather than returning the error is what lets the page's save
      // bar tell this field apart from the ones that succeeded.
      if (result.error) throw new Error(result.error);
      return { sem, yr };
    },
    onSuccess: ({ sem, yr }) => {
      setSavedSemester(sem);
      setSavedYear(yr);
    },
  });

  const dirty = semester !== savedSemester || year !== savedYear;
  const error = validateGraduation(semester, year ? parseInt(year, 10) : null);

  function handleYearChange(v: string) {
    setYear(v);
    // Switching to the current year can strand a semester that has already
    // passed; drop it rather than leaving an invalid pair selected.
    if (semester && v === String(new Date().getFullYear())) {
      if (isGraduationInPast(semester, parseInt(v, 10))) setSemester("");
    }
  }

  return (
    <SettingsField
      id="graduation"
      label="Graduation"
      isDirty={dirty}
      error={error}
      save={() => mutation.mutateAsync({ sem: semester, yr: year })}
      reset={() => {
        setSemester(savedSemester as Semester | "");
        setYear(savedYear);
      }}
    >
      <div className="flex max-w-sm gap-2 *:flex-1">
        <Select
          value={semester}
          onValueChange={(v) => setSemester(v as Semester | "")}
          placeholder="Semester"
        >
          <Select.Item
            value="spring"
            disabled={isSemesterDisabled("spring", year)}
          >
            Spring
          </Select.Item>
          <Select.Item
            value="summer"
            disabled={isSemesterDisabled("summer", year)}
          >
            Summer
          </Select.Item>
          <Select.Item value="fall" disabled={isSemesterDisabled("fall", year)}>
            Fall
          </Select.Item>
        </Select>
        <Select
          value={year}
          onValueChange={handleYearChange}
          placeholder="Year"
        >
          {new Array(6)
            .fill(new Date().getFullYear())
            .map((y, i) => String(y + i))
            .map((y) => (
              <Select.Item value={y} key={y}>
                {y}
              </Select.Item>
            ))}
        </Select>
      </div>
    </SettingsField>
  );
}
