import type { Section } from "./domain/section";
import type { ClassData, WeekSchedule } from "~/types/scheduleTypes";

const BG_COLORS = [
  "bg-[#cc0128]",
  "bg-[#bc8da7]",
  "bg-[#0db1b1]",
  "bg-[#53917e]",
  "bg-[#202c59]",
];

const BORDER_COLORS = [
  "border-[#cc0128]",
  "border-[#bc8da7]",
  "border-[#0db1b1]",
  "border-[#53917e]",
  "border-[#202c59]",
];

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_NAMES: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

// Day-code letters used by DayClass (e.g. "MWF"). Saturday/Sunday use S/U so
// they don't collide with the weekday letters.
const DAY_CODE_MAP: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "R",
  friday: "F",
  saturday: "S",
  sunday: "U",
};

/** First and last hour drawn on the week grid. */
export const SCHEDULE_START_HOUR = 8;
export const SCHEDULE_END_HOUR = 22;

/**
 * Height of the grid in minutes. The grid draws one row per hour inclusive of
 * both ends, so the span is one hour longer than the difference.
 */
export const SCHEDULE_SPAN_MINUTES =
  (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1) * 60;

/** "HH:MM:SS" → minutes since midnight. */
function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (h === undefined || m === undefined || isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function formatTime(t: string | null): string {
  const minutes = toMinutes(t);
  if (minutes === null) return "TBA";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Labs share their lecture's colour: "CSCI1302L" keys as "CSCI1302". */
function colorKey(abbr: string): string {
  const trimmed = abbr.trim();
  return trimmed.endsWith("L") ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Transforms the shared Section domain model into the WeekSchedule format
 * the WeekSchedule and DayClass components render.
 */
export function toWeekSchedule(sections: Section[]): WeekSchedule {
  const colorMap = new Map<string, { bg: string; border: string }>();
  let colorIndex = 0;

  function getColors(abbr: string) {
    if (!colorMap.has(abbr)) {
      const idx = colorIndex % BG_COLORS.length;
      colorMap.set(abbr, { bg: BG_COLORS[idx]!, border: BORDER_COLORS[idx]! });
      colorIndex++;
    }
    return colorMap.get(abbr)!;
  }

  const week: WeekSchedule = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  };

  for (const section of sections) {
    const { bg, border } = getColors(colorKey(section.courseAbbr));
    const professorName = section.professor?.name ?? "TBA";

    for (const meeting of section.meetings) {
      // Filtering DAY_KEYS (rather than iterating meeting.days) fixes the
      // display order to Monday..Sunday regardless of the input order.
      const activeDays = DAY_KEYS.filter((d) => meeting.days.includes(d));
      if (activeDays.length === 0) continue;

      const startMinutes = toMinutes(meeting.startTime);
      // A TBA meeting has no position on the grid's time axis and would pile
      // up at the 8 AM line with zero height.
      if (startMinutes === null) continue;
      const timeStart = formatTime(meeting.startTime);
      const timeEnd = formatTime(meeting.endTime);
      const location = meeting.building?.description ?? "TBA";

      // Build the day-code string used by DayClass (e.g. "MWF")
      const currentDayCode = activeDays.map((d) => DAY_CODE_MAP[d]).join("");

      const classData: ClassData = {
        classTitle: section.courseAbbr,
        className: section.courseNumber,
        description: section.courseTitle,
        locationLong: location,
        locationShort: location,
        prereq: "",
        coreq: "",
        professor: professorName,
        semester: "",
        credits: section.creditHours.max,
        crn: section.crn,
        openSeats: section.seatsAvailable,
        maxSeats: section.maximumEnrollment,
        waitlist: Math.max(
          0,
          section.actualEnrollment - section.maximumEnrollment,
        ),
        bgColor: bg,
        borderColor: border,
        timeStart,
        timeEnd,
        // Minutes from the top of the grid. Computed here from the raw DB time
        // rather than re-parsed from the formatted display string.
        timeDifference: startMinutes - SCHEDULE_START_HOUR * 60,
        currentDay: currentDayCode,
        otherTimes: ["", "", ""],
      };

      for (const day of activeDays) {
        week[DAY_NAMES[day]]!.push(classData);
      }
    }
  }

  return week;
}
