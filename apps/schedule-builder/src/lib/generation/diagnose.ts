import { formatCourseCode } from "../courseCode";
import type { Section } from "../domain/section";
import type { GenerationConstraints } from "./constraints";
import { activeRules, searchSchedules, type GenerationCourse } from "./engine";
import { noConflicts } from "./noConflicts";
import type { ScheduleRule } from "./rule";

/**
 * PURE: explains, in the user's terms, why `generateSchedules` found nothing
 * for these courses — one message per distinct cause, each naming the course
 * and the constraint to relax. Call it only after generation reported
 * `no-schedules`. It never hardcodes a feature: constraint wording comes from
 * each rule's `describe` hook (see `rule.ts`), so a new rule is explained by
 * implementing that hook.
 *
 * Works in three steps, stopping at the first that explains the failure:
 *
 * 1. A course whose every section a rule's `allowSection` rejects.
 * 2. Otherwise, a constraint whose removal alone would let a schedule
 *    through (credit-hour bounds, or the filters combined with conflicts).
 * 3. Otherwise, the courses simply collide: a pair whose sections all overlap.
 */
export function diagnoseNoSchedules(
  courses: GenerationCourse[],
  ctx: GenerationConstraints,
): string[] {
  const rules = activeRules(ctx);

  const emptied = courses.flatMap((course) => {
    const message = explainEmptiedCourse(course, rules, ctx);
    return message === undefined ? [] : [message];
  });
  if (emptied.length > 0) return emptied;

  const blockers = rules.flatMap((rule) => {
    const setting = rule.describe?.(ctx).setting;
    if (setting === undefined) return [];
    const without = rules.filter((r) => r !== rule);
    return searchSchedules(courses, without, ctx, 1).length > 0
      ? [setting]
      : [];
  });
  if (blockers.length > 0) {
    return [
      `No conflict-free combination of these courses fits ${joinList(blockers, "and")}. Relaxing ${blockers.length === 1 ? "it" : "any one of them"} would allow a schedule.`,
    ];
  }

  const collision = findCollidingCourses(courses, rules, ctx);
  if (collision !== undefined) {
    const [a, b] = collision;
    return [
      `Every available section of ${label(a)} overlaps every available section of ${label(b)}. Drop one of them or allow more sections.`,
    ];
  }

  return [
    "These courses can't be combined without time conflicts. Try dropping a course or allowing more sections.",
  ];
}

function label(course: GenerationCourse): string {
  return formatCourseCode(course.courseCode, course.sections[0]?.courseNumber);
}

function joinList(items: string[], conjunction: "and" | "or"): string {
  if (items.length <= 2) return items.join(` ${conjunction} `);
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

/**
 * When every section of `course` fails some `allowSection`, names the
 * requirements of every rule that rejected at least one of them: "No section
 * of CHEM 1211L ends by 5 PM." A course with no sections at all is skipped
 * (nothing was rejected, so no rule is to blame).
 */
function explainEmptiedCourse(
  course: GenerationCourse,
  rules: ScheduleRule[],
  ctx: GenerationConstraints,
): string | undefined {
  if (course.sections.length === 0) return undefined;

  const culprits = new Set<ScheduleRule>();
  for (const section of course.sections) {
    const failed = rules.filter(
      (rule) => !(rule.allowSection?.(section, ctx) ?? true),
    );
    if (failed.length === 0) return undefined;
    for (const rule of failed) culprits.add(rule);
  }

  const requirements = [...culprits].flatMap((rule) => {
    const requirement = rule.describe?.(ctx).requirement;
    return requirement === undefined ? [] : [requirement];
  });
  if (requirements.length === 0) return undefined;

  return `No section of ${label(course)} ${joinList(requirements, "and")}.`;
}

/** The first pair of courses with no mutually conflict-free sections. */
function findCollidingCourses(
  courses: GenerationCourse[],
  rules: ScheduleRule[],
  ctx: GenerationConstraints,
): [GenerationCourse, GenerationCourse] | undefined {
  const allowed = (course: GenerationCourse): Section[] =>
    course.sections.filter((section) =>
      rules.every((rule) => rule.allowSection?.(section, ctx) ?? true),
    );

  for (const [i, a] of courses.entries()) {
    for (const b of courses.slice(i + 1)) {
      const bSections = allowed(b);
      const compatible = allowed(a).some((x) =>
        bSections.some((y) => noConflicts([x, y])),
      );
      if (!compatible) return [a, b];
    }
  }
  return undefined;
}
