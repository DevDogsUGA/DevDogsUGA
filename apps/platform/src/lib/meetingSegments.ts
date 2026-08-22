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
   * Never empty — `open` is the fallback, so there is always something to say.
   * Ordered; see `resolveMeetingSegments`.
   */
  segments: MeetingSegment[];
  /**
   * The officer's `kind`, verbatim, or null.
   *
   * Kept SEPARATE from `segments` rather than replacing them, because the
   * caller needs to know which it got. A social with a workshop attached is a
   * real thing, and a page that swapped the derived set for the override would
   * quietly stop listing the workshop.
   */
  kindOverride: string | null;
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
 * The segments a meeting shows, plus the officer's override if there is one.
 *
 * ## The ordering
 *
 * `judging` → `kickoff` → `workshop` → `open`, and callers take the first as
 * the primary — the calendar's dot colour, the badge that fits on a narrow
 * card. The order is by consequence-of-missing-it, not by rarity:
 *
 * - `judging` is first because it is the only segment with a **deadline**
 *   behind it. Rosters lock and `competedAt` freezes at that instant, so a
 *   member who misreads that night loses something; nobody loses anything by
 *   misreading a teaching night.
 * - `kickoff` outranks `workshop` because it is where teams form and a
 *   week-long clock starts. Skipping it costs you the competition, not just
 *   the session.
 * - `workshop` last of the real three; `open` never appears alongside anything,
 *   so its position is only a formality.
 *
 * Worth being explicit that mid-semester this makes `judging` the primary
 * segment for nearly every meeting, because the model says a meeting normally
 * straddles two competitions. That is not the ordering failing to
 * discriminate — it is the calendar correctly reporting that most club nights
 * carry a deadline. A page that wants variety should render the whole set,
 * which is why this returns one.
 *
 * `judging` and `workshop` are not exclusive; neither are `workshop` and
 * `kickoff`. A kickoff is always also a workshop and both are returned, so a
 * caller filtering on `workshop` never misses a night that taught something.
 */
export function resolveMeetingSegments(
  meeting: MeetingStructure,
): MeetingBilling {
  const segments: MeetingSegment[] = [];

  if (meeting.judgedCompetitions.length > 0) segments.push("judging");
  // A workshop with no competition is a supplementary session — a structural
  // fact worth exactly one star, not a missing row — so `workshop` without
  // `kickoff` is a normal, complete state rather than one to paper over.
  if (meeting.workshops.some((w) => w.competitionSlug !== null)) {
    segments.push("kickoff");
  }
  if (meeting.workshops.length > 0) segments.push("workshop");
  if (segments.length === 0) segments.push("open");

  return { segments, kindOverride: meeting.kind };
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
 * link, and is the meeting happening — and the copy around it is worded as a
 * pointer rather than a promise.
 */
export function attendanceFormIsLive(
  // Structural, not a `Pick` of the loader's row type: importing that here
  // would point the dependency back at the module this one exists to stay out
  // of. `MeetingSummary` satisfies it by shape.
  meeting: {
    startsAt: Date;
    endsAt: Date;
    attendanceFormUrl: string | null;
  },
  now = new Date(),
): boolean {
  return (
    meeting.attendanceFormUrl !== null &&
    now >= meeting.startsAt &&
    now < meeting.endsAt
  );
}
