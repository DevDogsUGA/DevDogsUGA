import type { ScheduleRule } from "../rule";

/**
 * Hard filter: reject any section whose CRN is in the excludedSections list.
 */
export const excludedSections: ScheduleRule = {
  allowSection(section, ctx) {
    return !ctx.excludedSections.includes(section.crn);
  },
};
