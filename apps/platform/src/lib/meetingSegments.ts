/**
 * What a meeting is, derived from its structure and nothing else.
 *
 * Split out of `~/server/loaders/meetings` because the CALENDAR needs it. That
 * module's first import is `~/server/db`, whose entry point runs
 * `createDb(env.DB_URL, relations)` at module scope with no `server-only`
 * guard, a top-level side effect a bundler cannot drop. A client component
 * importing `resolveMeetingSegments` as a VALUE from there pulls the database
 * module into the browser graph, where t3-env's client proxy throws on
 * `env.DB_URL` during hydration, not SSR. The server render looks fine and the
 * break surfaces only in a visitor's console. Type-only imports are erased and
 * were never the problem.
 *
 * So this file reads no clock, no database and no environment, and its types are
 * structural rather than `Pick`s of the loader's row types: the loader imports
 * this, never the reverse. `MeetingInRange` still satisfies `MeetingStructure`
 * by shape, and the loader re-exports everything here so server-side callers can
 * keep importing from it.
 */

/**
 * What a meeting's structure says it has: `workshop` when one or more live
 * `workshops` rows hang off it. That is the only derived segment. What a night
 * IS (build, social, milestone...) is its authored `category`; a night with no
 * workshops has no segments, and nothing prints a fallback label for it.
 */
export type MeetingSegment = "workshop";

/**
 * The subset of a meeting the resolver reads.
 *
 * Narrowed to exactly this rather than taking a `MeetingInRange` so the rule can
 * be exercised without a database.
 */
export interface MeetingStructure {
  workshops: readonly unknown[];
}

export interface MeetingBilling {
  /**
   * What the STRUCTURE says. Empty for a night with no workshops, which is
   * normal: the chip for such a night is its category's.
   */
  segments: MeetingSegment[];
}

/** What a meeting's structure says it is. */
export function resolveMeetingSegments(
  meeting: MeetingStructure,
): MeetingBilling {
  const segments: MeetingSegment[] = [];
  if (meeting.workshops.length > 0) segments.push("workshop");
  return { segments };
}
