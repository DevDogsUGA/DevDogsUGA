import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  MapPinIcon,
} from "@phosphor-icons/react/ssr";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import LinkButton from "~/ui/link-button";
import EventsGrid from "./EventsGrid";
import FindUs, { FindUsLink } from "./FindUs";
import { getCalendarMonth } from "~/app/(site)/calendarMonth";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";

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
  /**
   * Rendered as the /events page itself rather than the homepage's section:
   * the heading becomes the page's h1, the directions trigger becomes a link
   * to /events/directions (which the page's `@modal` slot intercepts into the
   * same dialog), and the All Events button — pointless on the page it points
   * to — gives its corner to the Involvement Network, where RSVPs live.
   */
  page?: boolean;
}

export default function EventsSection({ topEdge, bottomEdge, page }: Props) {
  const month = getCalendarMonth();
  const Heading = page ? "h1" : "h2";

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
            <Heading className="font-display mb-4 text-4xl font-extrabold text-black md:text-5xl">
              Events
            </Heading>
            <p className="text-base/relaxed text-balance text-mauve-700">
              Every week, rain or shine: workshops that teach a feature area,
              week-long competitions to build it, and open build sessions on
              Wednesdays in between.
            </p>
            {/* One room for everything, so it is said once here rather than
                repeated on all four cards. */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-black">
                <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
                DLW 124 — the new Dining, Learning &amp; Well-Being center
              </p>
              {page ? <FindUsLink /> : <FindUs />}
            </div>
          </div>

          <EventsGrid month={month} />

          <div className="mt-6 flex justify-end">
            {page ? (
              <a
                href={INVOLVEMENT_NETWORK_EVENTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK_CLS}
              >
                RSVP on the Involvement Network <ArrowUpRightIcon />
              </a>
            ) : (
              <LinkButton href="/events" className={FOOTER_LINK_CLS}>
                All Events <ArrowRightIcon />
              </LinkButton>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
