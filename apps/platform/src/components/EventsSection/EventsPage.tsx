import type { ReactNode } from "react";
import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react/ssr";
import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import PageHeader from "~/components/PageHeader";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import MonthCalendar from "./MonthCalendar";
import NextMeeting from "./NextMeeting";
import ScheduleList from "./ScheduleList";
import PastMeetings from "./PastMeetings";
import HowItWorks from "./HowItWorks";

const FOOTER_LINK_CLS =
  "flex items-center gap-2 rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white";

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
 * The events page, in the console dialect: the gated pages' dark mauve shell —
 * `bg-mauve-900` body, accent blobs, a `PageHeader`, and one `ConsoleCard` per
 * section — on a public route. It is the one public page drawn this way, so a
 * member who signs in does not step between two visual worlds to get from
 * "when do we meet" to "check my streak".
 *
 * The order is an argument, not a layout. A visitor arrives wanting one fact —
 * when is the next one — so the first card is that meeting and nothing else.
 * The second is every meeting the club has on the books, coming and gone, with
 * the calendar beside it: the same list widened to the semester. The third
 * explains what the chips in the first two mean — a kickoff, a judging, an
 * open build — and it sits last because a reader who already knows can stop
 * scrolling before it.
 *
 * The accent is cyan because cyan already means "competition" everywhere on
 * this page — `meetingView` colours every judging and kickoff chip with it —
 * so the page wears the colour its own content is about.
 *
 * Every band is presentational and takes data as props. Nothing here reads
 * the clock or the database; `now` and `today` are resolved once by the
 * layout so the first card, the rows and the calendar cannot disagree
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
  // The first card has the next one in full, so the ledger starts after it
  // rather than printing the same night twice under two different treatments.
  const rest = next ? upcoming.slice(1) : upcoming;

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="cyan" />
      <PageHeader
        title="Events"
        description="Every meeting the club has on the books — the next one first, then all of them, then how a week of it fits together."
        accent="cyan"
      />
      {/* One room for almost everything, so it is said once here rather than
          repeated on every row. A meeting somewhere else says so on its own
          row — see ScheduleList's "Not the usual room". */}
      <p className="-mt-2 flex items-center gap-2 px-1 text-sm font-medium text-mauve-300">
        <MapPinIcon className="shrink-0 text-mauve-400" weight="fill" />
        DLW 124 — the new Dining, Learning &amp; Well-Being center
      </p>

      <ConsoleCard.Root id="next">
        <ConsoleCard.Header title="Next meeting" />
        <ConsoleCard.Content>
          <NextMeeting meeting={next} now={now} checkIn={checkIn} />
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="all">
        <ConsoleCard.Header title="All meetings" />
        <ConsoleCard.Content>
          {/* The calendar is the narrower column: it answers "what does the
              month look like", which is a glance, while the ledger answers
              "what is actually on", which is reading. */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-5">
            <div className="lg:col-span-2">
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
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {/* No Card.Header: HowItWorks titles itself — it is shared with the
          homepage, which needs the heading too — so the card is only the
          frame around it here. */}
      <ConsoleCard.Root>
        <ConsoleCard.Content>
          <HowItWorks id="how-it-works" tone="dark" />
        </ConsoleCard.Content>
      </ConsoleCard.Root>

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
  );
}
