import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  MapPinIcon,
} from "@phosphor-icons/react/ssr";
import SectionBackground, { type BlobDef } from "~/ui/section-background";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import MonthCalendar from "./MonthCalendar";
import Marquee from "./Marquee";
import ScheduleList from "./ScheduleList";
import PastMeetings from "./PastMeetings";

const EVENTS_BLOBS: BlobDef[] = [
  { cx: "25%", cy: "30%", rx: "55%", ry: "50%", fill: "#fecdd3" },
  { cx: "80%", cy: "65%", rx: "50%", ry: "55%", fill: "#fb7185", opacity: 0.6 },
  {
    cx: "72%",
    cy: "10%",
    rx: "40%",
    ry: "35%",
    fill: "#fed7aa",
    opacity: 0.55,
  },
  { cx: "12%", cy: "78%", rx: "38%", ry: "32%", fill: "#fdba74", opacity: 0.5 },
];

const FOOTER_LINK_CLS =
  "hover:shadow-block-md transition-lift flex items-center gap-2 rounded-sm border-2 border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

export interface EventsPageProps {
  /** Every meeting in the loaded window, ascending. Usually three months. */
  meetings: MeetingInRange[];
  past: MeetingSummary[];
  /** How many past meetings exist beyond `past`, for the archive's paging. */
  pastMoreCount: number;
  pastPage: number;
  /** Resolved once by the caller and threaded down — see the layout. */
  now: Date;
  today: { year: number; month: number; day: number } | null;
  bounds: {
    from: { year: number; month: number };
    to: { year: number; month: number };
  };
  /** The uncached check-in island, created outside the layout's cache scope. */
  checkIn?: ReactNode;
}

/**
 * The events page: four bands over one background, and every one of them a
 * date.
 *
 * The order is an argument, not a layout. A visitor arrives wanting one fact —
 * when is the next one — so the marquee answers that before anything else, the
 * calendar and the schedule widen that answer to the month, and the archive
 * sits last because it is the only band nobody arrives for.
 *
 * What is NOT here is the explainer. It used to sit between the schedule and
 * the archive, and it is the homepage's band now: this page is for somebody
 * who wants a date, and the homepage is for somebody deciding whether the
 * dates are worth having. Keeping one copy on the page whose question it
 * answers is what keeps the two pages from being versions of each other. The
 * vocabulary the badges below use still has to mean something to a first-time
 * reader, so it is defined once in the header, in one sentence, with a link
 * through to the long version.
 *
 * Every band is presentational and takes data as props. Nothing here reads the
 * clock or the database; `now` and `today` are resolved once by the layout so
 * the marquee, the schedule and the calendar cannot disagree about what day it
 * is halfway down the page.
 */
export default function EventsPage({
  meetings,
  past,
  pastMoreCount,
  pastPage,
  now,
  today,
  bounds,
  checkIn,
}: EventsPageProps) {
  // "Next" is bounded on `endsAt`, not `startsAt`: a meeting already in
  // progress is still the one somebody deciding whether to walk over cares
  // about, which is the same rule `getUpcomingMeetings` uses.
  const upcoming = meetings.filter((m) => m.endsAt >= now);
  const next = upcoming[0] ?? null;
  // The marquee has the first one in full, so the list starts after it rather
  // than printing the same night twice under two different treatments.
  const rest = next ? upcoming.slice(1) : upcoming;

  return (
    <div className="mx-4 overflow-hidden rounded-xl md:mx-6">
      <section
        id="events"
        className="relative w-full overflow-hidden pt-(--section-skew-slope) pb-(--section-skew-slope)"
        data-animate="fade-up"
      >
        <SectionBackground
          topEdge="flat"
          bottomEdge="flat"
          base="#fff1f2"
          blobs={EVENTS_BLOBS}
        />
        <div className="relative z-10 mx-auto max-w-6xl space-y-10 px-6 py-8 md:px-12">
          <div className="max-w-prose text-left">
            <h1 className="font-display mb-4 text-4xl font-extrabold text-black md:text-5xl">
              Events
            </h1>
            <p className="text-base/relaxed text-balance text-mauve-700">
              Every meeting the club has on the books — the next one first, then
              the rest of the month, then the ones already behind us.
            </p>
            {/* The badge vocabulary, defined once. The three-beat version of
                this with the diagrams is on the homepage; a reader who came
                here for a date should not have to scroll past it, but a reader
                seeing "Kickoff" for the first time still needs it to mean
                something. */}
            <p className="mt-3 text-sm/relaxed text-mauve-600">
              A night is named for what happens on it: a{" "}
              <strong className="font-semibold text-black">workshop</strong>{" "}
              teaches a feature area, a{" "}
              <strong className="font-semibold text-black">kickoff</strong>{" "}
              opens the week-long competition that follows it,{" "}
              <strong className="font-semibold text-black">judging</strong> is
              where the previous one is presented, and an{" "}
              <strong className="font-semibold text-black">open build</strong>{" "}
              is the room with no agenda. Most nights are more than one of
              these.
            </p>
            <Link
              href="/#how-it-works"
              className="mt-2 flex w-fit items-center gap-1.5 text-sm font-semibold text-black underline underline-offset-4 hover:no-underline"
            >
              How a competition works <ArrowRightIcon />
            </Link>
            {/* One room for almost everything, so it is said once here rather
                than repeated on every row. A meeting somewhere else says so on
                its own row — see ScheduleList's "Not the usual room". */}
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-black">
              <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
              DLW 124 — the new Dining, Learning &amp; Well-Being center
            </p>
          </div>

          <Marquee meeting={next} now={now} checkIn={checkIn} />

          {/* The calendar is the narrower column: it answers "what does the
              month look like", which is a glance, while the list answers "what
              is actually on", which is reading. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2" data-animate="fade-up">
              {/* Opens on the CURRENT month, not the window's first — the
                  window reaches a month back so somebody can page to what just
                  happened, and opening there would show a month of past
                  meetings to a visitor asking what is next. */}
              <MonthCalendar
                meetings={meetings}
                initialYear={today?.year ?? bounds.from.year}
                initialMonth={today?.month ?? bounds.from.month}
                today={today}
                bounds={bounds}
              />
            </div>
            <div className="lg:col-span-3">
              <ScheduleList meetings={rest} now={now} />
            </div>
          </div>

          <PastMeetings
            meetings={past}
            moreCount={pastMoreCount}
            page={pastPage}
          />

          <div className="flex justify-end">
            <a
              href={INVOLVEMENT_NETWORK_EVENTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={FOOTER_LINK_CLS}
            >
              RSVP on the Involvement Network <ArrowUpRightIcon />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
