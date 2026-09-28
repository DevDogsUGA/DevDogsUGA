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
 * What a meeting is, derived from its structure.
 *
 * A competition is not a child of a workshop or a meeting -- it is a
 * mirrored GitHub issue with its own asynchronous lifecycle (see the
 * competitions migration's header), so nothing about a meeting's STRUCTURE
 * can answer "does this meeting kick off or judge a competition". What is
 * left is the one thing a meeting's rows can still say about themselves:
 *
 * | Segment    | Derived from                                     |
 * | ---------- | ------------------------------------------------- |
 * | `workshop` | one or more live `workshops` rows on this meeting  |
 * | `open`     | none of the above, the structural fallback         |
 */
export type MeetingSegment = "workshop" | "open";

/**
 * The subset of a meeting the resolver reads.
 *
 * Narrowed to exactly this rather than taking a `MeetingInRange` so the rule can
 * be exercised without a database. The page's colour coding and copy hang off
 * these segments, and a rule needing live Postgres to test stops being tested.
 */
export interface MeetingStructure {
  kind: string | null;
  workshops: readonly unknown[];
}

export interface MeetingBilling {
  /**
   * What the STRUCTURE says, ordered; see `resolveMeetingSegments`.
   *
   * **Can be empty**, which it could not before. A night whose `kind` an officer
   * authored, a build session or a study session, has no structure to derive
   * from, and `open` is suppressed there so the two do not both speak. A caller
   * rendering chips must render `meeting.kind` alongside this or such a night
   * gets no chip at all.
   *
   * This does NOT carry the officer's `kind`: that would be a pass-through
   * of something every call site already has in scope.
   */
  segments: MeetingSegment[];
}

/**
 * What a meeting's structure says it is.
 *
 * ## The ordering
 *
 * `workshop` → `open`, and callers take the first as the primary: the
 * calendar's dot colour, the badge that fits on a narrow card. The two are
 * already mutually exclusive -- `open` fires only when there is no workshop
 * to report.
 */
export function resolveMeetingSegments(
  meeting: MeetingStructure,
): MeetingBilling {
  const segments: MeetingSegment[] = [];

  if (meeting.workshops.length > 0) segments.push("workshop");

  // `open` is what structural SILENCE looks like, and `kind` is the officer's
  // word for a night the structure cannot describe: the same condition said the
  // other way round, so they must never both speak. A build session would
  // otherwise render "Unscheduled · Build Session", the derived fallback
  // contradicting the person who told us what the night was.
  //
  // This is why `segments` can come back empty. A caller rendering only these
  // and not `meeting.kind` gives an authored night no chip at all.
  if (segments.length === 0 && meeting.kind === null) segments.push("open");

  return { segments };
}
