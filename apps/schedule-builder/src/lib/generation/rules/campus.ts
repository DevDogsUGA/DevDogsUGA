import type { ScheduleRule } from "../rule";

/**
 * Hard filter: when a campus is specified, reject any section not on that
 * campus. When campusId is undefined, all sections are accepted (no filter).
 */
export const campus: ScheduleRule = {
  allowSection(section, ctx) {
    // If no campus filter is set, accept all sections
    if (ctx.campusId === undefined) {
      return true;
    }
    // If a campus filter is set, only accept sections on that campus
    return section.campus.id === ctx.campusId;
  },
};
