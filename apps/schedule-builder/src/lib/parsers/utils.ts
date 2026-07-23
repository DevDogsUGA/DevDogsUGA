import { format, isValid, parse } from "date-fns";

export function parseTime(raw: string | null | undefined) {
  if (!raw || raw === "TBA") return null;
  const d = parse(raw.trim(), "hh:mm aa", new Date());
  return isValid(d) ? format(d, "HH:mm") : null;
}

export function parseDate(raw: string | null | undefined) {
  if (!raw || raw === "TBA") return null;
  const d = parse(raw.trim(), "M/d/yyyy", new Date());
  return isValid(d) ? format(d, "yyyy-MM-dd") : null;
}

const SEMESTER_INFO: Record<
  number,
  { name: string; semester: "spring" | "summer" | "fall" }
> = {
  2: { name: "Spring", semester: "spring" },
  5: { name: "Summer", semester: "summer" },
  8: { name: "Fall", semester: "fall" },
};

export function academicPeriodInfo(academicPeriod: number) {
  const year = Math.floor(academicPeriod / 100);
  const info = SEMESTER_INFO[academicPeriod % 100];
  if (!info) throw new Error(`Invalid academic period: ${academicPeriod}`);
  return { description: `${info.name} ${year}`, semester: info.semester };
}
