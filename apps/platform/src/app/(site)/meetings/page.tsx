import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventSpan, formatRelative } from "~/lib/eventTime";
import {
  checkInIsOpen,
  getPastMeetings,
  getUpcomingMeetings,
  type MeetingSummary,
} from "~/server/loaders/meetings";

/**
 * /meetings — what is coming, and what already happened.
 *
 * Public: no session. A prospective member deciding whether to walk over on a
 * Tuesday is the main audience for the top half of this page, and asking them
 * to sign in first would be asking them to join before they know what they are
 * joining.
 *
 * Both lists are drawn from soft-archived data. The loaders filter
 * `deletedAt is null` themselves — an officer deleting the wrong Airtable row
 * takes a meeting off this page without taking anybody's attendance with it —
 * so nothing here re-checks it.
 */
export default async function MeetingsPage() {
  // The upcoming/past split is a comparison against the clock, and the
  // check-in badge below flips within a single evening. Prerendering this page
  // would pin both to build time.
  await connection();

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    getUpcomingMeetings(),
    getPastMeetings(),
  ]);

  return (
    <ConsolePageShell
      accent="emerald"
      title="Meetings"
      description="Every DevDogs meeting, and the workshops that ran at each one. Check in with the code on the screen while you are in the room."
    >
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Upcoming</h2>

        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing scheduled yet"
            body="The next meeting appears here as soon as officers put it on the calendar. Past meetings are below in the meantime."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                trailing={
                  checkInIsOpen(meeting, now) ? (
                    <span className="rounded-sm border-2 border-black bg-green-50 px-2 py-1 text-xs font-semibold">
                      Check-in open
                    </span>
                  ) : (
                    // Relative, not absolute: the exact date is already on the
                    // line above, and "in 2 days" is the part somebody
                    // scanning the list is actually reading for.
                    <span className="text-sm opacity-70">
                      {formatRelative(meeting.startsAt, now)}
                    </span>
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Past</h2>

        {past.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            body="Once the first meeting is over it stays here, with its workshops and everything earned at it."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                trailing={
                  <span className="text-sm opacity-70">
                    {meeting.attendanceCount === 1
                      ? "1 checked in"
                      : `${meeting.attendanceCount} checked in`}
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </ConsolePageShell>
  );
}

function MeetingRow({
  meeting,
  trailing,
}: {
  meeting: MeetingSummary;
  trailing: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-sm border-2 border-black bg-white p-4">
      <span className="flex min-w-0 flex-col">
        <Link href={`/meetings/${meeting.slug}`} className="font-semibold">
          {meeting.name}
        </Link>
        <span className="text-xs opacity-70">
          <time dateTime={meeting.startsAt.toISOString()}>
            {formatEventSpan(meeting.startsAt, meeting.endsAt)}
          </time>
          {meeting.location !== null && ` · ${meeting.location}`}
          {" · "}
          {meeting.workshopCount === 1
            ? "1 workshop"
            : `${meeting.workshopCount} workshops`}
        </span>
      </span>

      {trailing}
    </li>
  );
}
