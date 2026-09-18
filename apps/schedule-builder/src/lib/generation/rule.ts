import type { Section } from "../domain/section";
import type { GenerationConstraints } from "./constraints";
import type { Importance } from "./importance";

/**
 * One pluggable feature of the schedule generator: a preference, an
 * exclusion, a hard cap, a scoring heuristic, or some combination. The
 * engine (`engine.ts`) knows nothing about any concrete feature — it only
 * knows how to call these hooks over whatever is registered in
 * `registry.ts`. Adding a feature means writing a `ScheduleRule` and
 * appending it to `RULES`; it never means editing the engine.
 *
 * Every hook is optional — implement only the ones a given rule needs. All
 * hooks receive the same `ctx: GenerationConstraints` so a rule can read
 * whatever inputs it cares about (and ignore the rest).
 *
 * IMPORTANT — the always-on no-conflicts invariant (no two chosen meetings
 * may overlap in weekday, time-of-day, and date range) is NOT expressed as a
 * rule here. It is not optional, not configurable, and not something a
 * feature could ever want to disable, so the engine calls `noConflicts`
 * directly on every partial schedule instead of going through the registry.
 */
export interface ScheduleRule {
  /**
   * Whether this rule applies at all, given the current constraints. Called
   * once per `generateSchedules` run. When omitted, the rule is always
   * active. A rule that is inactive is skipped entirely — none of its other
   * hooks are called — so an expensive rule can cheaply opt out when its
   * feature isn't in use (e.g. no preferred start time was given).
   */
  isActive?(ctx: GenerationConstraints): boolean;

  /**
   * Whether a single candidate section may be added to a schedule at all,
   * independent of what else has been picked so far (e.g. "this section is
   * excluded", "this section's campus doesn't match"). Called once per
   * candidate section before the engine ever recurses into it, so returning
   * `false` prunes every branch that would have included it.
   */
  allowSection?(section: Section, ctx: GenerationConstraints): boolean;

  /**
   * Whether a partial schedule (one section chosen for each course
   * considered so far, but not necessarily every course) may still lead to
   * a valid final schedule.
   *
   * CRITICAL — this hook MUST be MONOTONIC: if a partial schedule fails it,
   * every schedule built by adding more sections to that partial must also
   * fail it. The engine relies on this to prune the whole branch the moment
   * a partial fails, without ever backtracking to reconsider it. A rule
   * that could only be violated by a partial but then satisfied again once
   * more sections are added (there is no such case for a *maximum*-shaped
   * constraint, but there is for a *minimum* — e.g. "total credit hours
   * >= 12" is false for every partial and can only become true once the
   * schedule is complete) must NOT be expressed here. Express minimums (and
   * any other constraint a later addition could still satisfy) only in
   * `allowSchedule`, which runs once the schedule is complete.
   */
  allowPartialSchedule?(
    partial: Section[],
    ctx: GenerationConstraints,
  ): boolean;

  /**
   * Whether a complete schedule (exactly one section per requested course)
   * is acceptable. Called once per fully-assembled candidate, after every
   * rule's `allowPartialSchedule` has already passed on it as a partial.
   * This is the only hook allowed to express non-monotonic constraints
   * (minimums, totals, anything that only makes sense once nothing more
   * will be added).
   */
  allowSchedule?(complete: Section[], ctx: GenerationConstraints): boolean;

  /**
   * A numeric desirability score for a complete, already-`allowSchedule`d
   * schedule. Scale and sign are up to the rule — the engine only compares
   * scores relative to each other within the same run, after combining
   * every active rule's score into one weight-normalised average (see
   * `engine.ts`). Higher must mean "more desirable".
   */
  score?(complete: Section[], ctx: GenerationConstraints): number;

  /**
   * Relative weight of this rule's `score` in that average. Defaults to
   * `"normal"` when omitted. Has no effect on a rule that doesn't define
   * `score`.
   */
  importance?: Importance;
}
