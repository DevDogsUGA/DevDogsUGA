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
] as const;

const DAY_NAMES: Record<(typeof DAY_KEYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

type PlanOffering = {
  crn: number;
  seatsAvailable: number;
  actualEnrollment: number;
  maximumEnrollment: number;
  courses: {
    abbr: string;
    title: string;
    courseNumber: string;
    maxCreditHours: number;
  } | null;
  instructors: { firstName: string | null; lastName: string | null } | null;
  meetings: {
    monday: boolean | null;
    tuesday: boolean | null;
    wednesday: boolean | null;
    thursday: boolean | null;
    friday: boolean | null;
    startTime: string | null;
    endTime: string | null;
    buildings: { description: string | null } | null;
  }[];
};

function formatTime(t: string | null): string {
  if (!t) return "TBA";
  // DB stores HH:MM:SS — convert to H:MMAM/PM
  const [h, m] = t.split(":").map(Number);
  if (h === undefined || m === undefined) return "TBA";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * Transforms the PostgREST plan offerings response into the WeekSchedule
 * format expected by the WeekSchedule / DayClass display components.
 */
export function toWeekSchedule(offerings: PlanOffering[]): WeekSchedule {
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
  };

  for (const offering of offerings) {
    const course = offering.courses;
    if (!course) continue;

    const { bg, border } = getColors(course.abbr);
    const instructor = offering.instructors;
    const professorName = instructor?.lastName
      ? `${instructor.firstName ?? ""} ${instructor.lastName}`.trim()
      : "TBA";

    for (const meeting of offering.meetings) {
      const activeDays = DAY_KEYS.filter((d) => meeting[d]);
      if (activeDays.length === 0) continue;

      const timeStart = formatTime(meeting.startTime);
      const timeEnd = formatTime(meeting.endTime);
      const location = meeting.buildings?.description ?? "TBA";

      // Build the day-code string used by DayClass (e.g. "MWF")
      const dayCodeMap: Record<(typeof DAY_KEYS)[number], string> = {
        monday: "M",
        tuesday: "T",
        wednesday: "W",
        thursday: "R",
        friday: "F",
      };
      const currentDayCode = activeDays.map((d) => dayCodeMap[d]).join("");

      const classData: ClassData = {
        classTitle: course.abbr,
        className: course.courseNumber,
        description: course.title,
        locationLong: location,
        locationShort: location,
        prereq: "",
        coreq: "",
        professor: professorName,
        semester: "",
        credits: course.maxCreditHours,
        crn: offering.crn,
        openSeats: offering.seatsAvailable,
        maxSeats: offering.maximumEnrollment,
        waitlist: Math.max(
          0,
          offering.actualEnrollment - offering.maximumEnrollment,
        ),
        bgColor: bg,
        borderColor: border,
        timeStart,
        timeEnd,
        timeDifference: null,
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
