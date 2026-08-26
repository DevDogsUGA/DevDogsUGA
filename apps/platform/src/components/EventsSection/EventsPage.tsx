import type { ReactNode } from "react";
import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import SectionBackground, { type BlobDef } from "~/ui/section-background";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import MonthCalendar from "./MonthCalendar";
import NextMeeting from "./NextMeeting";
import ScheduleList from "./ScheduleList";
import PastMeetings from "./PastMeetings";
import HowItWorks from "./HowItWorks";

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
 * The events page: three sections over one background, separated by rules.
 *
 * The order is an argument, not a layout. A visitor arrives wanting one fact —
 * when is the next one — so the first section is that meeting and nothing
 * else. The second is every meeting the club has on the books, coming and
 * gone, with the calendar beside it: the same list widened to the semester.
 * The third explains what the chips in the first two mean — a kickoff, a
 * judging, an open build — and it sits last because a reader who already
 * knows can stop scrolling before it.
 *
 * Nothing here is a card. The previous page was a card for the next meeting,
 * a card for the calendar, a card per upcoming night and a boxed table, on a
 * site where the card is already the answer to everything else; the rules
 * between sections and down the ledger are all the structure the page needs,
 * and the next meeting's type size does the rest.
 *
 * Every band is presentational and takes data as props. Nothing here reads
 * the clock or the database; `now` and `today` are resolved once by the
 * layout so the first section, the rows and the calendar cannot disagree
 * about what day it is halfway down the page.
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
  // The first section has the next one in full, so the ledger starts after it
  // rather than printing the same night twice under two different treatments.
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
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 px-6 py-8 md:gap-16 md:px-12">
          <div className="max-w-prose text-left">
            <h1 className="font-display mb-4 text-4xl font-extrabold text-black md:text-5xl">
              Events
            </h1>
            <p className="text-base/relaxed text-balance text-mauve-700">
              Every meeting the club has on the books — the next one first, then
              all of them, then how a week of it fits together.
            </p>
            {/* One room for almost everything, so it is said once here rather
                than repeated on every row. A meeting somewhere else says so on
                its own row — see ScheduleList's "Not the usual room". */}
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-black">
              <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
              DLW 124 — the new Dining, Learning &amp; Well-Being center
            </p>
          </div>

          <PageSection id="next" number="01" title="Next meeting">
            <NextMeeting meeting={next} now={now} checkIn={checkIn} />
          </PageSection>

          <PageSection id="all" number="02" title="All meetings">
            {/* The calendar is the narrower column: it answers "what does the
                month look like", which is a glance, while the ledger answers
                "what is actually on", which is reading. */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-5">
              <div className="lg:col-span-2" data-animate="fade-up">
                {/* Opens on the CURRENT month, not the window's first — the
                    window reaches a month back so somebody can page to what
                    just happened, and opening there would show a month of past
                    meetings to a visitor asking what is next. */}
                <MonthCalendar
                  meetings={meetings}
                  initialYear={today?.year ?? bounds.from.year}
                  initialMonth={today?.month ?? bounds.from.month}
                  today={today}
                  bounds={bounds}
                />
              </div>
              <div className="flex flex-col gap-10 lg:col-span-3">
                <ScheduleList meetings={rest} now={now} />
                <PastMeetings
                  meetings={past}
                  moreCount={pastMoreCount}
                  page={pastPage}
                />
              </div>
            </div>
          </PageSection>

          <PageSection id="how-it-works" number="03" bare>
            <HowItWorks id="how-it-works" />
          </PageSection>

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

/**
 * One of the page's three sections: a heavy rule, a number, a heading.
 *
 * The number is the section's only ornament, and it is there so the three
 * read as a sequence rather than three unrelated bands stacked on one plate.
 * `bare` is for a child that brings its own heading — `HowItWorks` is shared
 * with the homepage and titles itself — so the wrapper draws the rule and the
 * number and nothing else.
 */
function PageSection({
  id,
  number,
  title,
  bare = false,
  children,
}: {
  id: string;
  number: string;
  title?: string;
  bare?: boolean;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={bare ? undefined : id}
      aria-labelledby={bare ? undefined : headingId}
      className="flex scroll-mt-28 flex-col gap-6 border-t-2 border-black pt-6 md:gap-8"
    >
      <p className="font-display text-xs font-extrabold tracking-widest text-mauve-500 uppercase">
        {number}
      </p>
      {!bare && title !== undefined && (
        <h2
          id={headingId}
          className="font-display text-3xl font-extrabold text-black md:text-4xl"
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
