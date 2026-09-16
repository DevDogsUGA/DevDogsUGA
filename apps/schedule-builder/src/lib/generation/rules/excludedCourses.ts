import type { ScheduleRule } from "../rule";

/**
 * Hard filter: reject any section whose course abbreviation is in the
 * excludedCourses list.
 */
export const excludedCourses: ScheduleRule = {
  allowSection(section, ctx) {
    return !ctx.excludedCourses.includes(section.courseAbbr);
  },
};
