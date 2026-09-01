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
 * The homepage's events section: the next few meetings and the way through to
 * the rest, then how a feature sprint works.
 *
 * Deliberately smaller than `/events`, and deliberately not built out of its
 * bands. This used to render the whole calendar and four cards, which made the
 * homepage and `/events` near-duplicates, and the cards were fabricated anyway.
 *
 * The split between the two is by question. `/events` answers *when*: every
 * meeting past and coming, and the calendar. The homepage answers *what happens
 * if I turn up*: a few concrete dates, and the format. So the section opens the
 * way the Projects section does, an "Events" heading over one short paragraph,
 * then the next three nights as a receding stack and "All events", which is the
 * job: handing the reader to `/events`. The explainer ("A Week in DevDogs", the
 * same component `/events` renders as its legend) sits a wide breath below, for
 * whoever wants to know what a night is like before turning up to one.
 *
 * The room is not named here. Where the club meets is a fact about a meeting,
 * and every meeting on `/events` says its own; the homepage only has to prove
 * there is one.
 */
export default async function EventsSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-clip rounded-xl md:mx-6">
      <section
        id="events"
        // scroll-mt clears the h-16 sticky TopNav when a marquee card jumps to
        // #id, the same idea as `ui/card`. It is measured from the border box,
        // whose top is where pt-(--section-skew-slope) begins, so the slanted
        // top edge clears the nav as well as the copy below it.
        className="relative w-full scroll-mt-20 overflow-clip pt-(--section-skew-slope) pb-(--section-skew-slope)"
      >
        <SectionBackground
          topEdge={topEdge}
          bottomEdge={bottomEdge}
          base="#f0fdff"
          blobs={EVENTS_BLOBS}
        />
        {/* `space-y-20`: the two halves are far enough apart to read as a
            break rather than as one more row of the stack, and the rule
            between them names the break rather than leaving it to the air
            alone. */}
        <div className="relative z-10 mx-auto max-w-6xl space-y-20 px-6 py-8 md:px-12">
          {/* What is coming, first: the section's header, the next three
              nights as a short stack, and the door to the rest. */}
          <div className="flex flex-col items-center gap-6">
            {/* The same header the Projects section uses: centred, the heading
                two sizes up from the explainer's, one short paragraph under
                it, so the two sections read as siblings. */}
            <div className="mx-auto max-w-prose space-y-4 text-center text-balance">
              <h2 className="font-display mb-8 text-4xl font-extrabold text-black md:text-5xl">
                Events
              </h2>
              <div className="mx-auto flex max-w-2xl flex-col gap-3 text-base/relaxed font-medium text-mauve-800">
                <p>
                  DevDogs meets regularly on Mondays and Wednesdays: we host
                  workshops, hackathons, and open build nights. Here&rsquo;s
                  what&rsquo;s next.
                </p>
              </div>
            </div>
            <UpcomingStack meetings={await nextMeetings(UPCOMING_COUNT)} />
            <LinkButton href="/events" className={FOOTER_LINK_CLS}>
              All events <ArrowRightIcon weight="bold" />
            </LinkButton>
          </div>

          {/* A real `<hr>`, because that is what this is: a thematic break
              between what is coming up and how a week of it works. A screen
              reader gets to hear the boundary the sighted reader sees.

              Violet because the section already owns it (two of the four blobs
              behind this plate are `violet-300` and `violet-400`), so the rule
              reads as the background stepping forward rather than a new colour
              arriving. Against the plate's near-white cyan (`#f0fdff`)
              violet-400 is unmistakable without the hardness a black hairline
              would bring to a plate made of soft blobs.

              Faded at both ends because a full-width line at constant weight
              would read as the edge of a box on a section that has none. The
              centre carries the weight, which is where the eye crosses from one
              half to the other. */}
          <hr
            id="how-it-works"
            className="h-0.5 scroll-mt-20 rounded-full border-0 bg-gradient-to-r from-transparent via-violet-400 to-transparent"
          />

          {/* The public anchor belongs to the divider above: that is the visual
              start of this half of the Events section. This private id keeps
              the explainer heading's aria relationship unique without making
              hash navigation skip the section's top. */}
          <HowItWorks id="how-it-works-content" cutout />
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
async function nextMeetings(count: number): Promise<MeetingInRange[]> {
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
