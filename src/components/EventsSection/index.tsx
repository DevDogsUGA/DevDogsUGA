import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import SectionBackground, {
  type BlobDef,
  type EdgeType,
} from "~/ui/section-background";
import LinkButton from "~/ui/link-button";
import EventsGrid from "./EventsGrid";
import { calendarEvents } from "~/app/(navbar)/homeData";

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

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
}

export default function EventsSection({ topEdge, bottomEdge }: Props) {
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
              Every week, rain or shine: workshops, hackathons, and open dev
              sessions to keep you building.
            </p>
          </div>

          <EventsGrid events={calendarEvents} />

          <div className="mt-6 flex justify-end">
            <LinkButton
              href="/events"
              className="hover:shadow-block-md transition-lift flex items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              All Events <ArrowRightIcon />
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
