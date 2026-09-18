import type { Section } from "../../domain/section";
import type { ScheduleRule } from "../rule";

/**
 * A dormant score rule that reads professor quality across a schedule.
 *
 * REACTIVATION PATH: if a future non-RMP rating source populates
 * `Section.professor.quality`, change `isActive` to return `true` (or a
 * condition based on user preferences). The score implementation is ready
 * to handle any non-null values and will gracefully handle mixed null/
 * non-null states.
 */
export const professorQuality: ScheduleRule = {
  /**
   * This rule is permanently inactive. RateMyProfessors was removed and
   * there is no current rating source to populate professor quality scores.
   */
  isActive: () => false,

  /**
   * Computes the average professor quality across all sections in the schedule.
   *
   * Null values (the current state post-RMP removal) are excluded from the
   * average. If all professors have null quality, returns 0 as a neutral score.
   *
   * @param complete - The complete schedule (one section per requested course)
   * @returns A number representing average quality, or 0 if no non-null qualities exist
   */
  score(complete: Section[]): number {
    let sum = 0;
    let count = 0;

    for (const section of complete) {
      // Only count sections with a professor and non-null quality
      if (section.professor?.quality != null) {
        sum += section.professor.quality;
        count++;
      }
    }

    // Return neutral 0 if no valid qualities exist (post-RMP state)
    return count === 0 ? 0 : sum / count;
  },
};
