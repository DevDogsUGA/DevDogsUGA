"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { getProfilePageData } from "~/server/loaders/console";
import InlineSave from "~/ui/inline-save";
import Select from "~/components/Select";
import { useSaveShortcut } from "~/hooks/useSaveShortcut";
import { useUnsavedChangesWarning } from "~/hooks/useUnsavedChangesWarning";
import { toast } from "~/lib/toast";
import updateGraduation from "~/server/actions/updateGraduation";

type ProfileData = Awaited<ReturnType<typeof getProfilePageData>>;
type Semester = "spring" | "summer" | "fall";

const SEMESTER_END_MONTH: Record<Semester, number> = {
  spring: 5,
  summer: 8,
  fall: 12,
};

function isInPast(semester: Semester, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return true;
  if (year > currentYear) return false;
  return SEMESTER_END_MONTH[semester] <= currentMonth;
}

function isSemesterDisabled(sem: Semester, selectedYear: string): boolean {
  const currentYear = new Date().getFullYear();
  if (!selectedYear || parseInt(selectedYear, 10) !== currentYear) return false;
  return isInPast(sem, currentYear);
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

  const isInvalid = !!semester !== !!year;

  const mutation = useMutation({
    mutationFn: async ({ sem, yr }: { sem: Semester | ""; yr: string }) => {
      const result = await updateGraduation(
        sem || null,
        yr ? parseInt(yr, 10) : null,
      );
      if (result.error) throw new Error(result.error);
    },
    onSuccess: (_, { sem, yr }) => {
      setSavedSemester(sem);
      setSavedYear(yr);
      toast.success("Graduation date saved");
    },
    onError: () => toast.error("Failed to save graduation date"),
  });

  const dirty = semester !== savedSemester || year !== savedYear;
  useUnsavedChangesWarning(dirty);
  const shortcut = useSaveShortcut(
    () => mutation.mutate({ sem: semester, yr: year }),
    dirty && !isInvalid && !mutation.isPending,
  );

  function handleYearChange(v: string) {
    setYear(v);
    if (semester && v === String(new Date().getFullYear())) {
      if (isInPast(semester, parseInt(v, 10))) {
        setSemester("");
      }
    }
  }

  return (
    <div onFocus={shortcut.onFocus} onBlur={shortcut.onBlur}>
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
      <InlineSave
        show={dirty}
        disabled={isInvalid}
        isPending={mutation.isPending}
        onSave={() => mutation.mutate({ sem: semester, yr: year })}
        onReset={() => {
          setSemester(savedSemester as Semester | "");
          setYear(savedYear);
        }}
        focused={shortcut.focused}
      />
    </div>
  );
}
