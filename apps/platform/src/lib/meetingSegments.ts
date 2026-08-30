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
 * There is no authored "meeting type" column, deliberately: a single night
 * judges last week's competition and teaches this week's workshop, so any
 * one-value field would pick a winner and lie about the other half. These are a
 * SET.
 *
 * | Segment    | Derived from                                           |
 * | ---------- | ------------------------------------------------------ |
 * | `judging`  | a competition whose judging starts inside this meeting  |
 * | `workshop` | one or more live `workshops` rows on this meeting       |
 * | `kickoff`  | one of those workshops opens a competition              |
 * | `open`     | none of the above, the structural fallback              |
 */
export type MeetingSegment = "judging" | "kickoff" | "workshop" | "open";

/**
 * The subset of a meeting the resolver reads.
 *
 * Narrowed to exactly this rather than taking a `MeetingInRange` so the rule can
 * be exercised without a database. The page's colour coding and copy hang off
 * these segments, and a rule needing live Postgres to test stops being tested.
 */
export interface MeetingStructure {
  kind: string | null;
  workshops: readonly { competitionSlug: string | null }[];
  judgedCompetitions: readonly unknown[];
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
   * This does NOT carry the officer's `kind`. It used to, as a field named
   * `kindOverride` that returned `meeting.kind` unchanged, a pass-through of
   * something every call site already had in scope.
   */
  segments: MeetingSegment[];
}

/**
 * Whether a competition's judging falls inside a meeting.
 *
 * Half-open on the meeting's span, so a competition judged at the instant the
 * next meeting starts belongs to that one rather than to both.
 *
 * **Derived from `judgingStartsAt`, not `judgingMeetingId`.** The two are
 * deliberately not constrained against each other: an officer fills Airtable
 * fields one keystroke at a time and a sync landing between them must not write
 * a refusal, so the pair is routinely inconsistent for thirty seconds and
 * sometimes longer. `judgingStartsAt` is the authority and `judgingMeetingId`
 * is a label, and every other predicate here already reads the datetime, the
 * roster lock and the freeze pass included. The bug this avoids is a calendar
 * that disagrees with the lock about which night judging happens: the page
 * prints "judging tonight" while rosters are still open, or teams freeze on a
 * night the page called an ordinary workshop.
 *
 * Null means "not scheduled yet" and returns false for every meeting rather
 * than being attributed to the labelled one, so an unscheduled competition
 * never counts as judged somewhere.
 */
export function isJudgedDuring(
  meeting: { startsAt: Date; endsAt: Date },
  judgingStartsAt: Date | null,
): boolean {
  if (judgingStartsAt === null) return false;
  return (
    judgingStartsAt >= meeting.startsAt && judgingStartsAt < meeting.endsAt
  );
}

/**
 * What a meeting's structure says it is.
 *
 * ## The ordering
 *
 * `workshop` → `kickoff` → `judging` → `open`, and callers take the first as
 * the primary: the calendar's dot colour, the badge that fits on a narrow card.
 *
 * This used to run `judging` first, because judging is the only segment with a
 * **deadline** behind it. Mid-semester that made `judging` primary for *nearly
 * every meeting*, since a normal night straddles two competitions, and a dot
 * that is rose every Monday carries no information.
 *
 * The current order follows the audience. Judging matters to somebody already on
 * a team; the workshop is what somebody deciding whether to *turn up* is coming
 * for, and this is a public schedule read by newcomers and members alike. So
 * `workshop` leads. `kickoff` sits next to it on purpose: a kickoff *is* the end
 * of a workshop, same room, same hour, and the two share a hue, so rose between
 * two emerald chips would draw a boundary that is not there. `judging` is third,
 * still rendered, still rose, still carrying its deadline, just no longer
 * colouring the dot on a night that also taught something. `open` is last and
 * now rare; see the suppression below.
 *
 * A consequence the calendar legend depends on: **`kickoff` can never be
 * primary.** It is pushed only when some workshop opens a competition, which
 * means `workshops.length > 0`, which means `workshop` was already pushed ahead
 * of it. A legend built from primary badges therefore excludes `kickoff` on its
 * own, without the special case the hand-written `SEGMENT_LEGEND` needed.
 *
 * `judging` and `workshop` are not exclusive; neither are `workshop` and
 * `kickoff`. A kickoff is always also a workshop and both are returned, so a
 * caller filtering on `workshop` never misses a night that taught something.
 */
export function resolveMeetingSegments(
  meeting: MeetingStructure,
): MeetingBilling {
  const segments: MeetingSegment[] = [];

  if (meeting.workshops.length > 0) segments.push("workshop");
  // A workshop with no competition is a supplementary session, not a missing
  // row, so `workshop` without `kickoff` is a complete state, not one to paper
  // over.
  if (meeting.workshops.some((w) => w.competitionSlug !== null)) {
    segments.push("kickoff");
  }
  if (meeting.judgedCompetitions.length > 0) segments.push("judging");

  // `open` is what structural SILENCE looks like, and `kind` is the officer's
  // word for a night the structure cannot describe: the same condition said the
  // other way round, so they must never both speak. A build session would
  // otherwise render "Unscheduled · Build Session", the derived fallback
  // contradicting the person who told us what the night was.
  //
  // This is why `segments` can come back empty, which it never could before. A
  // caller rendering only these and not `meeting.kind` gives an authored night
  // no chip at all.
  if (segments.length === 0 && meeting.kind === null) segments.push("open");

  return { segments };
}

/**
 * Whether there is a form to point somebody at, right now.
 *
 * Deliberately NOT "whether attendance is open". The platform stopped being able
 * to answer that when the check-in codes went: the Airtable form's own open and
 * close is the only gate, and this process cannot read it. Claiming otherwise
 * would put an "Attendance open" badge next to a form that is closed.
 *
 * So this answers the narrower question. Is there a link, is the meeting
 * happening, and is it still ON. The copy around it is worded as a pointer
 * rather than a promise.
 *
 * ⚠️ `cancelledAt` is part of "is the meeting happening", and used to be missing
 * from it. The guard existed exactly once, as a `!cancelled &&` at one of the
 * three call sites; the other two were safe by accident, because they happened
 * to be fed by `getUpcomingMeetings`, which filters cancelled rows at the
 * loader. `getMeetingsInRange` and `getMeetingBySlug` both KEEP them by design,
 * so any caller reaching for this predicate with one of their rows got a live
 * check-in button on a night that was called off, and an attendance row a member
 * then has to argue their way out of.
 */
export function attendanceFormIsLive(
  // Structural, not a `Pick` of the loader's row type: importing that here would
  // point the dependency back at the module this one exists to stay out of.
  // `MeetingSummary` satisfies it by shape.
  meeting: {
    startsAt: Date;
    endsAt: Date;
    attendanceFormUrl: string | null;
    cancelledAt: Date | null;
  },
  now = new Date(),
): boolean {
  return (
    meeting.attendanceFormUrl !== null &&
    meeting.cancelledAt === null &&
    now >= meeting.startsAt &&
    now < meeting.endsAt
  );
}
