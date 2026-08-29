/**
 * What a meeting is, derived from its structure — and nothing else.
 *
 * Split out of `~/server/loaders/meetings` because the CALENDAR needs it. That
 * module's first import is `~/server/db`, whose entry point runs
 * `createDb(env.DB_URL, relations)` at module scope with no `server-only`
 * guard, so it has an observable top-level side effect a bundler cannot drop.
 * A client component importing `resolveMeetingSegments` as a VALUE from there
 * would therefore pull the database module into the browser graph, where
 * t3-env's client proxy throws on `env.DB_URL` — during hydration, not SSR, so
 * the server render would look perfectly fine and the break would surface only
 * in a visitor's console.
 *
 * Type-only imports are erased and were never the problem; this exists so the
 * one value import has somewhere safe to come from. It reads no clock, no
 * database and no environment, which is the property that has to hold.
 *
 * The types below are structural rather than `Pick`s of the loader's row
 * types, so the dependency points one way: the loader imports this, never the
 * reverse. `MeetingInRange` still satisfies `MeetingStructure` by shape.
 *
 * `~/server/loaders/meetings` re-exports everything here, so server-side
 * callers can keep importing from the loader as they always have.
 */

/**
 * What a meeting is, derived from its structure.
 *
 * There is no authored "meeting type" column to read, and that is deliberate:
 * a single night judges last week's competition and teaches this week's
 * workshop, so any one-value field would have to pick a winner and lie about
 * the other half. These are a SET.
 *
 * | Segment    | Derived from                                              |
 * | ---------- | --------------------------------------------------------- |
 * | `judging`  | a competition whose judging starts inside this meeting     |
 * | `workshop` | one or more live `workshops` rows on this meeting          |
 * | `kickoff`  | one of those workshops opens a competition                 |
 * | `open`     | none of the above — the structural fallback                |
 */
export type MeetingSegment = "judging" | "kickoff" | "workshop" | "open";

/**
 * The subset of a meeting the resolver reads.
 *
 * Narrowed to exactly this rather than taking a `MeetingInRange` so the rule
 * can be exercised without a database — the segments are the thing the whole
 * page's colour-coding and copy hang off, and a rule that needs a live
 * Postgres to test is a rule that stops being tested.
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
   * **Can be empty**, which it could not before. A night whose `kind` an
   * officer authored — a build session, a study session — has no structure to
   * derive from, and `open` is suppressed there precisely so the two do not
   * both speak. A caller rendering chips must therefore render `meeting.kind`
   * alongside this or such a night gets no chip at all.
   *
   * This does NOT carry the officer's `kind`. It used to, as a field named
   * `kindOverride` that returned `meeting.kind` unchanged — a pure
   * pass-through of something every call site already had in scope.
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
 * fields one keystroke at a time and a sync landing between them must not
 * write a refusal, so the pair is routinely inconsistent for thirty seconds
 * and occasionally for longer. The design note settles which one wins —
 * `judgingStartsAt` is the authority and `judgingMeetingId` is a label — and
 * every other predicate in this codebase already reads the datetime, the
 * roster lock and the freeze pass included. A calendar that disagreed with the
 * lock about which night judging happens is the specific bug this avoids: the
 * page would print "judging tonight" while rosters were still open, or freeze
 * teams on a night the page called an ordinary workshop.
 *
 * Null therefore means "not scheduled yet" and returns false for every meeting
 * rather than being attributed to the labelled one — which is what stops an
 * unscheduled competition from silently counting as judged somewhere.
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
 * the primary — the calendar's dot colour, the badge that fits on a narrow
 * card.
 *
 * This used to run `judging` first, ranked by consequence-of-missing-it on the
 * argument that judging is the only segment with a **deadline** behind it.
 * That argument is sound, and it was answering the wrong question. The old
 * comment conceded the consequence itself: mid-semester it made `judging`
 * primary for *nearly every meeting*, because the model says a normal night
 * straddles two competitions. A dot that is rose every single Monday carries
 * no information — discriminating is the calendar's whole job, and
 * consequence-ranking made it monochrome.
 *
 * The deeper reason is audience. Judging matters to somebody already on a
 * team; the workshop is what somebody deciding whether to *turn up* is coming
 * for, and this is a public schedule read by newcomers and members alike. So:
 *
 * - `workshop` first, because it is what the night teaches — the thing a
 *   reader who does not yet know what a sprint is can act on.
 * - `kickoff` next, adjacent to `workshop` on purpose. A kickoff *is* the end
 *   of a workshop — same room, same hour, "now go build this" — and the two
 *   share a hue, so putting rose between two emerald chips would draw a
 *   boundary that is not there.
 * - `judging` third. Still rendered, still rose, still carrying its deadline;
 *   just no longer the thing that colours the dot on a night that also taught
 *   something.
 * - `open` last, and now genuinely rare — see the suppression below.
 *
 * A consequence the calendar legend depends on: **`kickoff` can never be
 * primary.** It is pushed only when some workshop opens a competition, which
 * means `workshops.length > 0`, which means `workshop` was already pushed
 * ahead of it. A legend built from primary badges therefore excludes `kickoff`
 * on its own, without the special case the hand-written `SEGMENT_LEGEND`
 * needed.
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
  // A workshop with no competition is a supplementary session — a structural
  // fact worth exactly one star, not a missing row — so `workshop` without
  // `kickoff` is a normal, complete state rather than one to paper over.
  if (meeting.workshops.some((w) => w.competitionSlug !== null)) {
    segments.push("kickoff");
  }
  if (meeting.judgedCompetitions.length > 0) segments.push("judging");

  // `open` is what structural SILENCE looks like, and `kind` is the officer's
  // word for a night the structure cannot describe — the same condition said
  // the other way round. So they must never both speak: a build session would
  // otherwise render "Unscheduled · Build Session", the derived fallback
  // contradicting the person who told us what the night was.
  //
  // This is why `segments` can now come back empty, which it never could
  // before. A caller rendering only these and not `meeting.kind` gives an
  // authored night no chip at all.
  if (segments.length === 0 && meeting.kind === null) segments.push("open");

  return { segments };
}

/**
 * Whether there is a form to point somebody at, right now.
 *
 * Deliberately NOT "whether attendance is open". The platform stopped being
 * able to answer that when the check-in codes went: the Airtable form's own
 * open and close is the only gate, and this process has no way to read it.
 * Claiming otherwise would put a confident "Attendance open" badge on a page
 * next to a form that is closed.
 *
 * So this answers the narrower question it can actually answer — is there a
 * link, is the meeting happening, and is it still ON — and the copy around it
 * is worded as a pointer rather than a promise.
 *
 * ⚠️ `cancelledAt` is part of "is the meeting happening", and used to be
 * missing from it. The guard existed exactly once, as a `!cancelled &&` at
 * one of the three call sites; the other two were safe only by accident,
 * because they happened to be fed by `getUpcomingMeetings`, which filters
 * cancelled rows at the loader. `getMeetingsInRange` and `getMeetingBySlug`
 * both KEEP them by design, so any caller reaching for this predicate with one
 * of their rows got a live check-in button on a night that was called off —
 * and an attendance row a member then has to argue their way out of.
 *
 * A predicate whose docstring says it answers "is the meeting on" has to
 * actually answer it, rather than leave the last third to whoever calls it.
 */
export function attendanceFormIsLive(
  // Structural, not a `Pick` of the loader's row type: importing that here
  // would point the dependency back at the module this one exists to stay out
  // of. `MeetingSummary` satisfies it by shape.
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
