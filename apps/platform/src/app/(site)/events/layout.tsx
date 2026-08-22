import { Suspense } from "react";
import { cacheLife } from "next/cache";
import EventsPage, {
  type EventsPageProps,
} from "~/components/EventsSection/EventsPage";
import EventsUnavailable from "~/components/EventsSection/EventsUnavailable";
import CheckInIsland from "~/components/EventsSection/CheckInIsland";
import UnderConstruction from "~/components/UnderConstruction";
import { EVENT_TZ } from "~/lib/eventTime";
import { getMeetingsInRange, getPastMeetings } from "~/server/loaders/meetings";

/**
 * The schedule lives in the layout rather than in `page.tsx` so that it stays
 * mounted underneath every route in this segment: `/events` renders it with an
 * empty `children`, `/events/directions` and `/events/[slug]` render it with a
 * dialog as `children`. Moving between them is a soft navigation that swaps
 * only the leaf, so a dialog opens over a calendar that never re-renders — and
 * the dialog's URL survives being shared or refreshed, which is what an
 * intercepting route would have given up on a cold load.
 *
 * That placement has one consequence worth stating, because it is not obvious
 * and it cost a boundary: `error.js` does not wrap the `layout.js` above it in
 * the same segment, so `events/error.tsx` cannot catch anything thrown here.
 * The read is therefore caught below, by hand.
 */
export default function EventsLayout({ children }: LayoutProps<"/events">) {
  // Build-time, not request-time, like the homepage: whatever DEPLOY_ENV holds
  // during `next build` decides which branch ships.
  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return (
    <>
      {/* Created OUTSIDE the cache scope and passed in as an element, so its
          clock read stays legal and uncached while everything around it is
          served from the entry — the pattern the homepage uses for StreakCTA.
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
    <div className="flex flex-col bg-black py-4 md:py-6">
      <EventsPage {...data} checkIn={checkIn} />
    </div>
  );
}

/**
 * Everything time- and database-dependent about the page, resolved once.
 *
 * `cacheLife` rather than a tag, because `revalidateTag` is inert here — the
 * Cloudflare adapter's `tagCache` is `"dummy"` — so there is no push
 * invalidation to reach for and freshness has to come from a TTL. The Airtable
 * sync runs every 15 minutes, so a five-minute revalidate means the page is
 * never more than one sync window behind, and `stale` lets a visitor have the
 * previous answer instantly while that happens.
 *
 * Reading the clock is legal here precisely because this IS a cache scope; the
 * value is resolved when the entry is built and handed down as data, so no
 * component below reads a clock and none of them can disagree about the date.
 * The cost is that `now` can be up to the revalidate window old, which is why
 * the marquee carries an `ended` branch rather than trusting "next" blindly.
 */
async function getSchedule(): Promise<Omit<EventsPageProps, "checkIn">> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 900 });

  const now = new Date();
  const today = clubDay(now);

  // A month back and two forward. Back, because the calendar should let
  // somebody page to the meeting they just missed; forward, because a semester
  // is announced in chunks and two months is as far ahead as the base is ever
  // filled in. Three months is also one query — see `getMeetingsInRange`.
  const from = addMonths(today.year, today.month, -1);
  const to = addMonths(today.year, today.month, 2);

  const [meetings, past] = await Promise.all([
    getMeetingsInRange(monthStart(from), monthStart(to)),
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
      to: addMonths(to.year, to.month, -1),
    },
  };
}

const PAST_PAGE_SIZE = 8;

/**
 * Today's date in the club's timezone.
 *
 * `getDate()` would answer in the *server's* zone, and a UTC host is already
 * on tomorrow while it is still this evening in Athens — so the "today"
 * highlight would land on the wrong square for several hours every night.
 * `formatToParts` with an explicit zone is the pure way to ask.
 */
const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function clubDay(at: Date): { year: number; month: number; day: number } {
  const parts = DAY_PARTS.formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Read by part type rather than by splitting the formatted string: field
  // order and separators belong to ICU and are not ours to assume.
  return { year: read("year"), month: read("month") - 1, day: read("day") };
}

function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: total % 12 };
}

/** Midnight on the first of a month, in UTC — the range bound for the query. */
function monthStart({ year, month }: { year: number; month: number }): Date {
  return new Date(Date.UTC(year, month, 1));
}
