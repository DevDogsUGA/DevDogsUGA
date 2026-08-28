"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { ACTION_DARK_CLS } from "~/components/EventsSection/meetingView";
import { formatEventDate } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import type { MeetingSummary } from "~/server/loaders/meetings";

/**
 * The archive — every night that already happened.
 *
 * A **table**, deliberately. The rows above this one carry chips and a
 * countdown because a member is deciding whether to come; nobody decides
 * anything here. This is the club's record, read by whoever wants to check
 * that DevDogs actually meets every week, and the question they are asking is
 * answered by four columns lining up down the page rather than by forty cards
 * they have to scroll. It is ruled like the rows above it rather than boxed,
 * so the two halves of the ledger read as one list that changes shape where
 * the nights stop being decisions and start being records.
 *
 * The attendance column is the reason the band exists. Everything else on the
 * events page is authored — an officer typed the name, the summary, the room —
 * but attendance is counted from check-ins the platform holds itself. It is
 * the one number here nobody could have simply written down, which makes it
 * the only public evidence of the thing the whole site claims, so it is shown
 * plainly and without decoration rather than buried in a detail page.
 *
 * Fetches nothing, and does not count anything: `attendanceCount` and
 * `workshopCount` arrive on `MeetingSummary` from subqueries in the loader.
 * Recomputing either here would mean loading every attendance row to get a
 * number Postgres already returned.
 */

interface Props {
  /** Most recent first. Whatever page the caller resolved, already sliced. */
  meetings: MeetingSummary[];
  /** How many more exist beyond what was passed, for the "show more" affordance. */
  moreCount?: number;
  /** The search param the caller pages with, e.g. "past". */
  pageParam?: string;
  /** The page currently shown, 1-based. */
  page?: number;
}

export default function PastMeetings({
  meetings,
  moreCount = 0,
  pageParam = "past",
  page = 1,
}: Props) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  // Matched against the rendered title rather than `nameOverride`, so a search
  // finds the night by the words the page actually showed. Most have no
  // authored name at all, so searching the column would find almost nothing.
  const shown =
    needle === ""
      ? meetings
      : meetings.filter((meeting) =>
          meetingTitle(meeting).toLowerCase().includes(needle),
        );

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="past-meetings-heading"
    >
      <h3
        id="past-meetings-heading"
        className="font-display text-xl font-extrabold text-white md:text-2xl"
      >
        Already happened
      </h3>

      {/* Only once the archive is long enough to be worth searching. Below
          that a search box is a control that costs more room than the rows it
          would filter — and it searches only the page in hand, which is the
          honest limit of a client-side filter over a paged table. */}
      {meetings.length > 5 && (
        <label className="flex flex-col gap-1 text-xs text-mauve-400">
          <span className="sr-only">Search past meetings</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this page…"
            className="w-full max-w-xs rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white placeholder:text-mauve-500 focus-visible:border-white focus-visible:outline-none"
          />
        </label>
      )}

      {meetings.length === 0 ? (
        // Short, and no card around it. An empty archive is a fact about a new
        // semester, not a state worth building a panel for.
        <p className="text-sm text-mauve-400">
          None yet this semester. Give it a Monday.
        </p>
      ) : (
        <>
          {/*
            The scroll container is a wrapper, not the table. A table sizes to
            its content and four columns of real meeting names exceed 390px,
            so without this the *page* scrolls sideways and every other band
            goes with it.
          */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <thead>
                <tr className="border-y border-mauve-800">
                  <Th>Date</Th>
                  <Th>Meeting</Th>
                  {/* Right-aligned with their cells: two number columns read as
                      a column only when the ones digits line up. */}
                  <Th numeric>Workshops</Th>
                  <Th numeric>Attendance</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((meeting) => (
                  <tr
                    key={meeting.id}
                    className="border-b border-mauve-800/50 last:border-b-mauve-800"
                  >
                    <Td className="whitespace-nowrap text-mauve-400 tabular-nums">
                      <time dateTime={meeting.startsAt.toISOString()}>
                        {formatEventDate(meeting.startsAt)}
                      </time>
                    </Td>
                    <Td>
                      <Link
                        href={`/events/${meeting.slug}`}
                        className="font-semibold text-white underline decoration-2 underline-offset-2 hover:no-underline"
                      >
                        {meetingTitle(meeting)}
                      </Link>
                    </Td>
                    <Td numeric>{meeting.workshopCount}</Td>
                    {/* `tabular-nums` on both number columns, so 7 and 112 sit
                        under each other instead of drifting with the width of
                        the glyphs — the whole reason a table beats cards here. */}
                    <Td numeric className="font-semibold text-white">
                      {meeting.attendanceCount}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Distinct from the empty-archive copy above: that one is a fact
              about the semester, this one is a fact about what the reader
              typed — and it says which page was searched, because the filter
              only sees the rows in hand. */}
          {shown.length === 0 && (
            <p className="text-sm text-mauve-400">
              Nothing on this page matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}

          {/*
            A link to a search param, never client state — and that still holds
            now that this band IS a client component for the search box above,
            because the reason was never the cost of the boundary. The archive
            is the part of this page somebody links to — "we met eleven times
            last spring, see" — and a page number in `useState` cannot be
            pasted or crawled. The search query deliberately goes the other
            way: it filters the page in hand, is nobody's permalink, and would
            be noise in a URL.

            The caller owns reading the param back; this only names the next
            page. Relative href, so it keeps whatever path and other params the
            page is already on rather than assuming it lives at /events.
          */}
          {moreCount > 0 && (
            <div className="flex justify-center">
              <Link
                href={`?${pageParam}=${page + 1}`}
                scroll={false}
                className={ACTION_DARK_CLS}
              >
                {moreCount === 1
                  ? "1 older meeting"
                  : `${moreCount} older meetings`}{" "}
                <ArrowRightIcon />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const CELL_CLS = "px-2 py-2.5 text-sm md:px-3";

function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`${CELL_CLS} font-display text-xs font-extrabold tracking-wide text-mauve-400 uppercase ${numeric ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
  className = "",
}: {
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`${CELL_CLS} ${numeric ? "text-right text-mauve-300 tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
