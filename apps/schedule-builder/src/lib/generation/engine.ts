import type { Section } from "../domain/section";
import type { GenerationConstraints } from "./constraints";
import { IMPORTANCE } from "./importance";
import { noConflicts } from "./noConflicts";
import { RULES } from "./registry";
import type { ScheduleRule } from "./rule";

/**
 * The search is exhaustive over the cartesian product of each course's
 * sections, so the input has to stay small: at ~8 sections per course, eleven
 * courses is already ~8^11 branches. Ported unchanged from
 * `../algorithm/brute-force.ts`.
 */
export const MAX_INPUT_COURSES = 10;

/** The engine returns at most this many schedules, highest score first. */
const MAX_RESULTS = 5;

/** One requested course: a group of candidate sections, one of which is
 * chosen per generated schedule. */
export interface GenerationCourse {
  courseCode: string;
  sections: Section[];
}

export type GenerationOutcome =
  | { ok: true; schedules: Section[][] }
  | { ok: false; reason: "no-courses" | "too-many-courses" | "no-schedules" };

// ─── Rule fan-out ───────────────────────────────────────────────────────────
//
// The engine never hardcodes a feature. Every check below just folds the
// same hook over whatever `RULES` currently holds; adding, removing, or
// reordering rule modules changes generation behaviour without touching any
// of this file.

function activeRules(ctx: GenerationConstraints): ScheduleRule[] {
  return RULES.filter((rule) => rule.isActive?.(ctx) ?? true);
}

function allowSection(
  rules: ScheduleRule[],
  section: Section,
  ctx: GenerationConstraints,
): boolean {
  return rules.every((rule) => rule.allowSection?.(section, ctx) ?? true);
}

function allowPartialSchedule(
  rules: ScheduleRule[],
  partial: Section[],
  ctx: GenerationConstraints,
): boolean {
  return rules.every(
    (rule) => rule.allowPartialSchedule?.(partial, ctx) ?? true,
  );
}

function allowSchedule(
  rules: ScheduleRule[],
  complete: Section[],
  ctx: GenerationConstraints,
): boolean {
  return rules.every((rule) => rule.allowSchedule?.(complete, ctx) ?? true);
}

/**
 * Weight-normalised average of every active, score-defining rule's score:
 * `sum(IMPORTANCE[rule.importance] * rule.score(...)) / sum(IMPORTANCE[...])`.
 * Normalising by the weight total means adding another "normal"-importance
 * scoring rule can't silently dilute the existing ones just by increasing
 * the rule count, and a rule with no `score` never affects the average.
 * A schedule scored against zero scoring rules (e.g. the empty registry)
 * scores 0 for everyone, so ranking degenerates to "any order" rather than
 * throwing on a divide-by-zero.
 */
function scoreSchedule(
  rules: ScheduleRule[],
  complete: Section[],
  ctx: GenerationConstraints,
): number {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const rule of rules) {
    if (!rule.score) continue;
    const weight = IMPORTANCE[rule.importance ?? "normal"];
    weightedSum += weight * rule.score(complete, ctx);
    weightTotal += weight;
  }

  return weightTotal === 0 ? 0 : weightedSum / weightTotal;
}

// ─── Search ─────────────────────────────────────────────────────────────────

function generateRecursive(
  partial: Section[],
  remaining: GenerationCourse[],
  rules: ScheduleRule[],
  ctx: GenerationConstraints,
  results: Section[][],
): void {
  // The always-on invariant: called directly, never through the registry.
  if (!noConflicts(partial)) return;

  // Monotonic rule checks: a partial that fails here can never be rescued by
  // adding more sections, so the whole branch is dead. See rule.ts for why
  // `allowPartialSchedule` implementations MUST be monotonic.
  if (!allowPartialSchedule(rules, partial, ctx)) return;

  if (remaining.length === 0) {
    // An empty section list is vacuously conflict-free; it is not a schedule.
    if (partial.length > 0 && allowSchedule(rules, partial, ctx)) {
      results.push(partial);
    }
    return;
  }

  const [next, ...rest] = remaining;
  for (const section of next!.sections) {
    if (!allowSection(rules, section, ctx)) continue;
    generateRecursive([...partial, section], rest, rules, ctx, results);
  }
}

/**
 * Generates candidate schedules — one section per requested course — and
 * returns the top-scoring complete, valid ones.
 *
 * Pruning happens while building each partial schedule: `noConflicts` (the
 * always-on invariant) and every active rule's `allowSection` /
 * `allowPartialSchedule` run on partials, so an invalid branch is abandoned
 * before the search descends any further into it. Once a schedule is
 * complete, every active rule's `allowSchedule` gets a final say — this is
 * the only place a non-monotonic constraint (e.g. a credit-hour minimum) can
 * run. Surviving schedules are scored by `scoreSchedule` and the top
 * `MAX_RESULTS` are returned, highest score first.
 *
 * The engine reads features from exactly two places: `noConflicts` (called
 * directly, since it's not optional) and `RULES` (the registry). It never
 * hardcodes a specific feature — that's what makes `registry.ts`'s rule
 * modules pluggable.
 */
export function generateSchedules(
  courses: GenerationCourse[],
  ctx: GenerationConstraints,
): GenerationOutcome {
  if (courses.length === 0) return { ok: false, reason: "no-courses" };
  if (courses.length > MAX_INPUT_COURSES) {
    return { ok: false, reason: "too-many-courses" };
  }

  const rules = activeRules(ctx);
  const complete: Section[][] = [];
  generateRecursive([], courses, rules, ctx, complete);

  if (complete.length === 0) return { ok: false, reason: "no-schedules" };

  const scored = complete
    .map((schedule) => ({
      schedule,
      score: scoreSchedule(rules, schedule, ctx),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    ok: true,
    schedules: scored.slice(0, MAX_RESULTS).map(({ schedule }) => schedule),
  };
}
