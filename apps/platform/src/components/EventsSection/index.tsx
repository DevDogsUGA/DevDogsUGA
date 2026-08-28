import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import LinkButton from "~/ui/link-button";
import { getMeetingsInRange } from "~/server/loaders/meetings";
import type { MeetingInRange } from "~/server/loaders/meetings";
import NextMeetingStrip from "./NextMeetingStrip";
import HowItWorks from "./HowItWorks";

export const EVENTS_BLOBS: BlobDef[] = [
  { cx: "25%", cy: "30%", rx: "55%", ry: "50%", fill: "#a5f3fc" }, // cyan
  { cx: "80%", cy: "65%", rx: "50%", ry: "55%", fill: "#22d3ee", opacity: 0.6 }, // cyan
  {
    cx: "72%",
    cy: "10%",
    rx: "40%",
    ry: "35%",
    fill: "#c4b5fd",
    opacity: 0.55,
  }, // violet
  { cx: "12%", cy: "78%", rx: "38%", ry: "32%", fill: "#a78bfa", opacity: 0.5 }, // violet
];

const FOOTER_LINK_CLS =
  "hover:shadow-block-md transition-lift flex items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

/**
 * The homepage's events section: the next few meetings and the way through
 * to the rest, then how a feature sprint works.
 *
 * Deliberately smaller than `/events`, and deliberately not built out of its
 * bands. This used to render the whole calendar and four cards, which made
 * the homepage and `/events` near-duplicates of each other — and the cards
 * were fabricated anyway.
 *
 * The split between the two is by question. `/events` answers *when*: every
 * meeting past and coming, and the calendar. The homepage answers *what
 * happens if I turn up*: the format, and one line of proof that there is a
 * next meeting at all. The explainer renders on both — it is the same
 * component — but here it is the subject, and its "Feature Sprints" heading
 * is the section's; there is no separate "Events" heading and no general
 * paragraph about the club meeting, because the explainer says all of that
 * better and the section has one job after it, which is to hand the reader
 * to `/events`. So the section opens with what is coming — "Upcoming
 * Events", the next three nights as a receding stack, "All events" — and
 * the explainer sits below a hairline cut across the plate, for whoever
 * wants to know what a night is like before turning up to one.
 *
 * The room is not named here. Where the club meets is a fact about a
 * meeting, and every meeting on `/events` says its own; the homepage only has
 * to prove there is one.
 */
export default async function EventsSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="events"
        // scroll-mt clears the h-16 sticky TopNav when a marquee card jumps
        // to #id — the same idea as `ui/card`. It is measured from the border
        // box, whose top is where pt-(--section-skew-slope) begins, so the
        // slanted top edge clears the nav too and not just the copy below it.
        className="relative w-full scroll-mt-20 overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
        data-animate="fade-up"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#f0fdff"
          blobs={EVENTS_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl space-y-12 px-6 py-8 md:px-12">
          {/* What is coming, first: the heading, the next three nights as a
              short stack — each a step smaller than the one before it, so
              the list recedes and the soonest is the one that reads — and
              the door to the rest. */}
          <div
            className="flex flex-col items-center gap-6"
            data-animate="fade-up"
          >
            <h2 className="font-display text-3xl font-extrabold text-black md:text-4xl">
              Upcoming Events
            </h2>
            <UpcomingStack meetings={await nextMeetings(UPCOMING_COUNT)} />
            <LinkButton href="/events" className={FOOTER_LINK_CLS}>
              All events <ArrowRightIcon />
            </LinkButton>
          </div>

          <SectionRule />

          <HowItWorks cutout />
        </div>
      </section>
    </div>
  );
}

/** How many nights the homepage names. Three is a glance; the schedule is
 *  for the rest. */
const UPCOMING_COUNT = 3;

/**
 * The next few meetings as a short stack: the soonest at full size, each one
 * after it scaled down a step about its top edge, so the list recedes into
 * the page and the eye lands on the first. Scale, not opacity — the third
 * night is still a real date somebody may be planning around, so it stays
 * fully legible, only smaller. The eyebrow changes with rank so three cards
 * do not all claim to be the next meeting.
 *
 * Empty is the ordinary summer state, and the strip already draws it — one
 * strip, with null, rather than an empty list.
 */
const STACK_STEP = ["", "scale-[0.95]", "scale-[0.9]"] as const;
const STACK_EYEBROW = ["Next meeting", "Then", "After that"] as const;

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
 * The line between what is coming and how it works: a single black cut
 * across the whole plate, the same idea as the strip's cutout further down
 * at a hairline's width, so the two halves of the section are divided by
 * the page showing through rather than by a border drawn on the plate. As
 * wide as the section for the same reason and by the same arithmetic as the
 * cutout — see `Cutout` in HowItWorks.
 */
function SectionRule() {
  return (
    <div className="relative h-0.5" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-[calc(100cqw-2rem)] -translate-x-1/2 bg-black md:w-[calc(100cqw-3rem)]" />
    </div>
  );
}

/**
 * The soonest meetings that have not ended, up to `count`, soonest first.
 *
 * Catches its own failure and degrades to an empty list rather than
 * throwing. The homepage is the club's front door and has no error boundary
 * of its own — a connection blip must cost the visitor a date, not the whole
 * page — and empty is a state the stack already renders properly, because an
 * empty summer is the ordinary case for months at a time.
 *
 * Bounded on `endsAt` like every other "upcoming" read here: a meeting already
 * in progress is still the one worth naming.
 */
async function nextMeetings(count: number): Promise<MeetingInRange[]> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCMonth(horizon.getUTCMonth() + 3);

  try {
    const meetings = await getMeetingsInRange(startOfDay(now), horizon);
    return meetings.filter((m) => m.endsAt >= now).slice(0, count);
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
