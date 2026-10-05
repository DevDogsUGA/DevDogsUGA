import { getMeetingsInRange } from "~/server/loaders/meetings";
import type { MeetingInRange } from "~/server/loaders/meetings";
import NextMeetingStrip from "./NextMeetingStrip";

/** How many nights the homepage names. Three is a glance; the schedule is
 *  for the rest. */
const UPCOMING_COUNT = 3;

/**
 * The next few meetings as a short stack: the soonest at full size, each one
 * after it scaled down a step about its top edge, so the list recedes into the
 * page and the eye lands on the first. Scale, not opacity: the third night is
 * still a real date somebody may be planning around, so it stays legible, only
 * smaller. The eyebrow changes with rank so three cards do not all claim to be
 * the next meeting.
 *
 * Empty is the ordinary summer state, and the strip already draws it. One
 * strip, with null, rather than an empty list.
 */
const STACK_STEP = ["", "scale-[0.95]", "scale-[0.9]"] as const;
const STACK_EYEBROW = ["Next meeting", "Then", "After that"] as const;

/**
 * Fetches and renders the homepage's short stack of upcoming nights.
 *
 * Deliberately a standalone component, called from `page.tsx` OUTSIDE
 * `HomeSections`'s `"use cache"` scope, rather than awaited inline inside
 * `EventsSection`. `nextMeetings` below reads "now" and the live schedule --
 * genuinely dynamic, per-request data -- and this deployment runs `"use
 * cache"` without Cache Components/PPR (see `next.config.ts`), which has no
 * mechanism to carve a per-request hole out of a cached subtree: everything a
 * `"use cache"` function touches gets baked into its single shared cache
 * entry, including whichever request's database connection happened to
 * populate it. A live Hyperdrive/postgres.js connection is scoped to the
 * request that opened it (see `~/server/db`'s `currentDb`), so once the
 * cached entry outlives that request -- or a second concurrent request
 * shares its population -- Workers refuses the socket write with "Cannot
 * perform I/O on behalf of a different request", which is what threw here
 * before this split (surfaced to the browser as React errors #419/#441).
 *
 * Rendering this element in `page.tsx` and passing it into `HomeSections` as
 * a prop keeps its data fetch on the current request the whole way through,
 * the same reason `AttendanceBanner` sits outside the cached page body in
 * `(site)/layout.tsx`.
 */
export default async function UpcomingMeetings() {
  return <UpcomingStack meetings={await nextMeetings(UPCOMING_COUNT)} />;
}

function UpcomingStack({ meetings }: { meetings: MeetingInRange[] }) {
  const now = new Date();
  if (meetings.length === 0)
    return <NextMeetingStrip meeting={null} now={now} />;

  return (
    <ol className="flex w-full max-w-2xl flex-col items-center gap-3">
      {meetings.map((meeting, i) => (
        <li
          key={meeting.id}
          className={`w-full origin-top ${STACK_STEP[i] ?? STACK_STEP[STACK_STEP.length - 1]}`}
        >
          <NextMeetingStrip
            meeting={meeting}
            now={now}
            eyebrow={
              STACK_EYEBROW[i] ?? STACK_EYEBROW[STACK_EYEBROW.length - 1]
            }
          />
        </li>
      ))}
    </ol>
  );
}

/**
 * The soonest meetings that have not ended, up to `count`, soonest first.
 *
 * Catches its own failure and degrades to an empty list rather than throwing.
 * The homepage is the club's front door and has no error boundary of its own,
 * so a connection blip must cost the visitor a date, not the whole page. The
 * stack already renders empty properly, because an empty summer is the ordinary
 * case for months at a time.
 *
 * Bounded on `endsAt` like every other "upcoming" read here: a meeting already
 * in progress is still the one worth naming.
 */
export async function nextMeetings(count: number): Promise<MeetingInRange[]> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCMonth(horizon.getUTCMonth() + 3);

  try {
    const meetings = await getMeetingsInRange(startOfDay(now), horizon);
    // Cancelled nights are skipped rather than shown struck through, and the
    // homepage has to say so itself: this reads `getMeetingsInRange`, which
    // deliberately keeps them because it feeds a SCHEDULE. This stack answers a
    // different question, where should I go, and naming a cancelled meeting as
    // the next one is worse than the vanishing the column was added to fix.
    return meetings
      .filter((m) => m.endsAt >= now && m.cancelledAt === null)
      .slice(0, count);
  } catch {
    return [];
  }
}

/**
 * Midnight UTC on `at`'s day, so a meeting happening *right now* is inside the
 * window. Starting the range at the current instant would exclude the very
 * meeting this function exists to find, an hour into it.
 */
function startOfDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}
