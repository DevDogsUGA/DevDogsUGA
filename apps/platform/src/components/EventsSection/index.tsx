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

const EVENTS_BLOBS: BlobDef[] = [
  { cx: "25%", cy: "30%", rx: "55%", ry: "50%", fill: "#fecdd3" }, // rose
  { cx: "80%", cy: "65%", rx: "50%", ry: "55%", fill: "#fb7185", opacity: 0.6 }, // rose
  {
    cx: "72%",
    cy: "10%",
    rx: "40%",
    ry: "35%",
    fill: "#fed7aa",
    opacity: 0.55,
  }, // amber
  { cx: "12%", cy: "78%", rx: "38%", ry: "32%", fill: "#fdba74", opacity: 0.5 }, // amber
];

const FOOTER_LINK_CLS =
  "hover:shadow-block-md transition-lift flex items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

/**
 * The homepage's events section: the next meeting, how a competition works,
 * and a way through to the rest.
 *
 * Deliberately smaller than `/events`, and deliberately not built out of its
 * bands. This used to render the whole calendar and four cards, which made
 * the homepage and `/events` near-duplicates of each other — and the cards
 * were fabricated anyway.
 *
 * The split between the two is by question. `/events` answers *when*: the next
 * meeting in full, every meeting past and coming, and the calendar. The
 * homepage answers *what happens if I turn up*: one line of proof that there
 * is a next meeting at all, and the format. The explainer renders on both —
 * it is the same component — but here it is the subject and there it is the
 * legend for the chips; the schedule lives there and only there.
 *
 * Nothing in here is boxed. The section used to stack a black strip, a rose
 * panel and three white cards inside it, on a site where the card is already
 * the answer to everything; now the next meeting is a ruled row and the
 * explainer is a heading, a timeline and a list, all straight on the plate.
 *
 * The room is not named here any more either. Where the club meets is a fact
 * about a meeting, and every meeting on `/events` says its own; the homepage
 * only has to prove there is one.
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
          base="#fff1f2"
          blobs={EVENTS_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-6 py-8 md:px-12">
          <div className="max-w-prose text-left">
            <h2 className="font-display mb-4 text-4xl font-extrabold text-black md:text-5xl">
              Events
            </h2>
            <p className="text-base/relaxed text-balance text-mauve-700">
              The club meets every week of the semester, and the shape of a
              night is always the same: a workshop teaches a feature area, a
              week-long competition puts it into practice, and the following
              meeting judges what got built. Turn up to any of it.
            </p>
          </div>

          <NextMeetingStrip meeting={await nextMeeting()} now={new Date()} />

          <HowItWorks />

          <div className="flex justify-end">
            <LinkButton href="/events" className={FOOTER_LINK_CLS}>
              All Events <ArrowRightIcon />
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The soonest meeting that has not ended, or null.
 *
 * Catches its own failure and degrades to null rather than throwing. The
 * homepage is the club's front door and has no error boundary of its own — a
 * connection blip must cost the visitor a date, not the whole page — and null
 * is a state the strip already renders properly, because an empty summer is
 * the ordinary case for months at a time.
 *
 * Bounded on `endsAt` like every other "upcoming" read here: a meeting already
 * in progress is still the one worth naming.
 */
async function nextMeeting(): Promise<MeetingInRange | null> {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCMonth(horizon.getUTCMonth() + 3);

  try {
    const meetings = await getMeetingsInRange(startOfDay(now), horizon);
    return meetings.find((m) => m.endsAt >= now) ?? null;
  } catch {
    return null;
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
