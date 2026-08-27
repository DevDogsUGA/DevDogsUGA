import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import PageHeader from "~/components/PageHeader";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import MonthCalendar from "./MonthCalendar";
import ScheduleList from "./ScheduleList";
import PastMeetings from "./PastMeetings";
import HowItWorks from "./HowItWorks";

/** `h-9` is the `text-3xl` line height, so the button centres on the h1's
 *  line rather than hanging from the header's top edge. */
const HEADER_LINK_CLS =
  "flex h-9 items-center gap-2 rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white";

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
 * Two cards. The first is the schedule: every meeting on the books, coming
 * and gone, with the calendar beside it — the next one is simply the first
 * row, at the top, rather than a band of its own saying the same thing at
 * three times the size. The second explains what the chips in the first mean,
 * and sits last because a reader who already knows can stop scrolling.
 *
 * The room is not named up here. Every row says its own, and the ones in the
 * usual room say nothing, which is how a room change stands out.
 *
 * The accent is cyan because cyan already means "competition" on this page —
 * `meetingView` colours every kickoff chip with it.
 *
 * Every band is presentational and takes data as props. Nothing here reads
 * the clock or the database; `now` and `today` are resolved once by the
 * layout so the rows and the calendar cannot disagree about what day it is.
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
  // Bounded on `endsAt`, not `startsAt`: a meeting already in progress is
  // still the one somebody deciding whether to walk over cares about, which
  // is the same rule `getUpcomingMeetings` uses.
  const upcoming = meetings.filter((m) => m.endsAt >= now);

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="cyan" />
      <PageHeader
        title="Events"
        description="What's next, what's been, and how a week of it works."
        accent="cyan"
      >
        {/* In the header's action slot, where the console puts a page's one
            outward link: the Involvement Network is where RSVPs live. */}
        <a
          href={INVOLVEMENT_NETWORK_EVENTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={HEADER_LINK_CLS}
        >
          View Us on the Involvement Network <ArrowUpRightIcon />
        </a>
      </PageHeader>

      <ConsoleCard.Root id="schedule">
        {/* The check-in link lives in the header's action slot: it is the
            one thing on the page that is live right now, and the header is
            where the console puts a card's one action. Null almost always. */}
        <ConsoleCard.Header title="Schedule">{checkIn}</ConsoleCard.Header>
        <ConsoleCard.Content>
          {/* The calendar is the narrower column: it answers "what does the
              month look like", which is a glance, while the list answers
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
              <ScheduleList meetings={upcoming} now={now} />
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
    </div>
  );
}
