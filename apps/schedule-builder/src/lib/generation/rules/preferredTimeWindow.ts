import type { Section } from "../../domain/section";
import type { GenerationConstraints } from "../constraints";
import type { ScheduleRule } from "../rule";

/**
 * Hard time-of-day window: a section is offered only when every one of its
 * timed meetings falls inside the user's preferred start and end times.
 * Meetings with no set time (async/TBA) never fall outside the window.
 *
 * When a course has no section left inside the window, generation returns no
 * schedules rather than one missing that course.
 */

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function startsAtOrAfter(section: Section, time: string): boolean {
  const bound = timeToMinutes(time);
  return section.meetings.every(
    (m) => m.startTime === null || timeToMinutes(m.startTime) >= bound,
  );
}

function endsAtOrBefore(section: Section, time: string): boolean {
  const bound = timeToMinutes(time);
  return section.meetings.every(
    (m) => m.endTime === null || timeToMinutes(m.endTime) <= bound,
  );
}

/** "17:00" -> "5 PM", "09:30" -> "9:30 AM". */
export function formatTimeOfDay(time: string): string {
  const minutes = timeToMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "AM" : "PM";
  return m === 0
    ? `${hour} ${suffix}`
    : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Rejects any section with a meeting that starts before `prefStartTime`. */
export const preferredStartTimeRule: ScheduleRule = {
  isActive: (ctx: GenerationConstraints) => ctx.prefStartTime !== undefined,
  allowSection(section: Section, ctx: GenerationConstraints): boolean {
    return (
      ctx.prefStartTime === undefined ||
      startsAtOrAfter(section, ctx.prefStartTime)
    );
  },
  describe(ctx) {
    const time = formatTimeOfDay(ctx.prefStartTime ?? "00:00");
    return {
      setting: `your ${time} earliest start time`,
      requirement: `starts at or after ${time}`,
    };
  },
};

/** Rejects any section with a meeting that ends after `prefEndTime`. */
export const preferredEndTimeRule: ScheduleRule = {
  isActive: (ctx: GenerationConstraints) => ctx.prefEndTime !== undefined,
  allowSection(section: Section, ctx: GenerationConstraints): boolean {
    return (
      ctx.prefEndTime === undefined || endsAtOrBefore(section, ctx.prefEndTime)
    );
  },
  describe(ctx) {
    const time = formatTimeOfDay(ctx.prefEndTime ?? "23:59");
    return {
      setting: `your ${time} latest end time`,
      requirement: `ends by ${time}`,
    };
  },
};
