import type { Section } from "../domain/section";
import type { GenerationCourse } from "./engine";

/**
 * PURE: sections cancelled since the last sync must never be recommended as
 * CRNs the student would then try to register for, and a filled section is
 * excluded unless the caller opted into seeing filled classes. Everything else
 * that used to be an in-memory pre-filter (campus, exclusions, credit hours,
 * time preferences) is now an engine rule, driven by GenerationConstraints.
 */
export function filterUsableSections(
  sections: Section[],
  showFilledClasses: boolean,
): Section[] {
  return sections.filter(
    (s) => !s.cancelled && (showFilledClasses || s.seatsAvailable > 0),
  );
}

/**
 * PURE: folds a flat list of sections into the engine's per-course input shape,
 * grouping by `courseAbbr` and preserving first-seen course order.
 */
export function groupSectionsByCourse(sections: Section[]): GenerationCourse[] {
  const courseMap = new Map<string, Section[]>();
  for (const section of sections) {
    const group = courseMap.get(section.courseAbbr) ?? [];
    group.push(section);
    courseMap.set(section.courseAbbr, group);
  }
  return [...courseMap.entries()].map(([courseCode, courseSections]) => ({
    courseCode,
    sections: courseSections,
  }));
}
