import { Suspense } from "react";
import { cacheLife } from "next/cache";
import EventsPage, {
  type EventsPageProps,
} from "~/components/EventsSection/EventsPage";
import EventsUnavailable from "~/components/EventsSection/EventsUnavailable";
import CheckInIsland from "~/components/EventsSection/CheckInIsland";
import EventsScrollReset from "~/components/EventsSection/EventsScrollReset";
import {
  addMonths,
  clubDay,
  clubMonthStart,
  scheduleWindow,
} from "~/lib/eventTime";
import {
  getFurthestMeetingStart,
  getMeetingsInRange,
  getPastMeetings,
} from "~/server/loaders/meetings";

/**
 * The schedule lives in the layout rather than in `page.tsx` so that it stays
 * mounted underneath every route in this segment: `/events` renders it with an
 * empty `children`, `/events/directions` and `/events/[slug]` render it with a
 * dialog as `children`. Moving between them is a soft navigation that swaps
 * only the leaf, so a dialog opens over a calendar that never re-renders. The
 * dialog's URL also survives being shared or refreshed, which is what an
 * intercepting route would have given up on a cold load.
 *
 * That placement has one non-obvious consequence, and it cost a boundary:
 * `error.js` does not wrap the `layout.js` above it in the same segment, so
 * `events/error.tsx` cannot catch anything thrown here. The read is therefore
 * caught below, by hand.
 */
export default function EventsLayout({ children }: LayoutProps<"/events">) {
  return (
    <>
      <EventsScrollReset />
      {/* Created OUTSIDE the cache scope and passed in as an element, so its
          clock read stays legal and uncached while everything around it is
          served from the entry. Same pattern the homepage uses for StreakCTA.
          Whether a check-in form is live is true for about two hours a week and
          must never be answered from a five-minute-old cache entry. */}
      <EventsBody
        checkIn={
          // Its own boundary so a slow read cannot hold up the schedule; the
          // fallback is nothing, because an absent button is the ordinary
          // state for every hour the club is not meeting.
          <Suspense fallback={null}>
            <CheckInIsland />
          </Suspense>
        }
      />
      {children}
    </>
  );
}

/**
 * Catches its own read, because nothing above it will.
 *
 * The `try` is deliberately OUTSIDE the cached function rather than inside it.
 * Catching within a `"use cache"` scope would make the fallback the cached
 * value, so one transient connection blip would serve "the schedule could not
 * be loaded" for the whole revalidate window to everybody. Letting the throw
 * escape the scope leaves nothing cached, and the next request tries again.
 */
async function EventsBody({ checkIn }: { checkIn: React.ReactNode }) {
  let data: Omit<EventsPageProps, "checkIn">;
  try {
    data = await getSchedule();
  } catch {
    return <EventsUnavailable />;
  }

  return (
    // The console wrapper, verbatim from the gated layouts: the page body is
    // `mauve-900`, one shade lighter than the cards that sit on it, and
    // `flex-1` so a short semester still paints to the footer.
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <EventsPage {...data} checkIn={checkIn} />
    </div>
  );
}

/**
 * Everything time- and database-dependent about the page, resolved once.
 *
 * `cacheLife` rather than a tag, because `revalidateTag` is inert here: the
 * Cloudflare adapter's `tagCache` is `"dummy"`. There is no push invalidation
 * to reach for, so freshness has to come from a TTL. The Airtable sync runs
 * every 15 minutes, so a five-minute revalidate means the page is never more
 * than one sync window behind, and `stale` lets a visitor have the previous
 * answer instantly while that happens.
 *
 * Reading the clock is legal here because this IS a cache scope; the value is
 * resolved when the entry is built and handed down as data, so no component
 * below reads a clock and none of them can disagree about the date. The cost is
 * that `now` can be up to the revalidate window old, which is why the marquee
 * carries an `ended` branch rather than trusting "next" blindly.
 */
async function getSchedule(): Promise<Omit<EventsPageProps, "checkIn">> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 900 });

  const now = new Date();
  const today = clubDay(now);

  // A month back, and forward as far as the base actually goes.
  //
  // The forward half used to be a constant two months, which is what hid a
  // whole semester the first time one was authored in a single sitting. The
  // arithmetic lives in `scheduleWindow` beside the rest of the club-calendar
  // maths, where it is testable and where the reason is written down; this
  // read is the only new cost, one indexed row.
  const furthest = await getFurthestMeetingStart();
  const { from, to } = scheduleWindow(today, furthest);

  const [meetings, past] = await Promise.all([
    getMeetingsInRange(clubMonthStart(from), clubMonthStart(to)),
    // One more than shown, which is how the archive knows whether to offer
    // "older meetings" without a second COUNT query.
    getPastMeetings(PAST_PAGE_SIZE + 1),
  ]);

  return {
    meetings,
    past: past.slice(0, PAST_PAGE_SIZE),
    pastMoreCount: Math.max(0, past.length - PAST_PAGE_SIZE),
    pastPage: 1,
    now,
    today,
    bounds: {
      from: { year: from.year, month: from.month },
      // Inclusive for the calendar's paging, so `to` names the last month a
      // reader can reach rather than the exclusive bound of the query.
      to: addMonths(to, -1),
    },
  };
}

const PAST_PAGE_SIZE = 8;
