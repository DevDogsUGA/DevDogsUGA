import { ArrowRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import LinkButton from "~/ui/link-button";
import { getMeetingsInRange } from "~/server/loaders/meetings";
import type { MeetingInRange } from "~/server/loaders/meetings";
import FindUs from "./FindUs";
import Marquee from "./Marquee";
import HowItWorks from "./HowItWorks";

const EVENTS_BLOBS: BlobDef[] = [
  { cx: "25%", cy: "30%", rx: "55%", ry: "50%", fill: "#fecdd3" }, // rose
  { cx: "80%", cy: "65%", rx: "50%", ry: "55%", fill: "#fb7185", opacity: 0.6 }, // rose
  { cx: "72%", cy: "10%", rx: "40%", ry: "35%", fill: "#fed7aa", opacity: 0.55 }, // amber
  { cx: "12%", cy: "78%", rx: "38%", ry: "32%", fill: "#fdba74", opacity: 0.5 }, // amber
];

const FOOTER_LINK_CLS =
  "hover:shadow-block-md transition-lift flex items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

/**
 * The homepage's events section: the next meeting, how the week works, and a
 * way through to the rest.
 *
 * Deliberately smaller than it was. This used to render the whole calendar and
 * four cards, which made the homepage and `/events` near-duplicates of each
 * other — and the cards were fabricated anyway. The homepage's job is to
 * convince somebody the club meets and is worth turning up to; the schedule
 * belongs on the page named after it.
 *
 * The directions trigger here is the IN-PLACE dialog rather than the link to
 * `/events/directions`: on the events page that URL opens over a calendar that
 * stays mounted, but from the homepage it would be a full navigation away from
 * everything else somebody was reading.
 */
export default async function EventsSection({ topEdge, bottomEdge }: Props) {
  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="events"
        className="relative w-full overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
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
              Every week, rain or shine: workshops that teach a feature area,
              week-long competitions to build it, and open build sessions in
              between.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-black">
                <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
                DLW 124 — the new Dining, Learning &amp; Well-Being center
              </p>
              <FindUs />
            </div>
          </div>

          <Marquee meeting={await nextMeeting()} now={new Date()} />

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
 * is a state the marquee already renders properly, because an empty summer is
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
